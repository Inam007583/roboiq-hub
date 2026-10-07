'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Profile, VenueRow, Session } from '@/lib/types'
import Link from 'next/link'
import ImportStudents from './ImportStudents'

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [meId, setMeId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [sessions, setSessions] = useState<Session[]>([])

  // Add-instructor form
  const [iEmail, setIEmail] = useState('')
  const [iName, setIName] = useState('')
  const [iRole, setIRole] = useState('instructor')
  const [savingInvite, setSavingInvite] = useState(false)

  // Venue form
  const [vName, setVName] = useState('')
  const [vAddress, setVAddress] = useState('')
  const [vPhotos, setVPhotos] = useState(false)
  const [savingVenue, setSavingVenue] = useState(false)

  // Session (rota) form
  const [sTitle, setSTitle] = useState('')
  const [sDate, setSDate] = useState('')
  const [sTime, setSTime] = useState('')
  const [sVenue, setSVenue] = useState('')
  const [sInstructor, setSInstructor] = useState('')
  const [sCoInstructors, setSCoInstructors] = useState<string[]>([])
  const [savingSession, setSavingSession] = useState(false)

  async function loadAll() {
    const [{ data: profs }, { data: vens }, { data: sess }] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('sessions').select('*, venues ( name )').order('date', { ascending: true }),
    ])
    setProfiles(profs || [])
    setVenues(vens || [])
    setSessions(sess || [])
  }

  // Add an instructor by email (grants access). If they've already signed in,
  // just re-activate their existing account; otherwise add them to the allowlist.
  async function addInstructor() {
    const email = iEmail.trim().toLowerCase()
    if (!email) { alert('Enter the instructor\'s email.'); return }
    setSavingInvite(true)
    const existing = profiles.find(p => (p.email || '').toLowerCase() === email)
    if (existing) {
      await supabase.from('profiles').update({ active: true, role: iRole }).eq('id', existing.id)
    } else {
      const { error } = await supabase
        .from('instructor_invites')
        .upsert({ email, full_name: iName.trim() || null, role: iRole }, { onConflict: 'email' })
      if (error) { setSavingInvite(false); alert(`Could not add instructor: ${error.message}`); return }
    }
    setSavingInvite(false)
    setIEmail(''); setIName(''); setIRole('instructor')
    alert(existing ? 'Access restored for this instructor.' : 'Instructor added — they can sign in with Google now.')
    await loadAll()
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: me } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!me || me.role !== 'admin') {
        router.push('/dashboard')
        return
      }

      setMeId(user.id)
      await loadAll()
      setLoading(false)
    }
    init()
  }, [])

  // ----- instructor actions -----
  async function setActive(id: string, active: boolean) {
    await supabase.from('profiles').update({ active }).eq('id', id)
    await loadAll()
  }
  async function setRole(id: string, role: string) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    await loadAll()
  }

  // ----- venue actions -----
  async function addVenue() {
    if (!vName.trim()) { alert('Venue name is required.'); return }
    setSavingVenue(true)
    const { error } = await supabase.from('venues').insert({
      name: vName.trim(),
      address: vAddress.trim() || null,
      requires_photos: vPhotos,
      active: true,
      brand: 'creative_iq',
    })
    setSavingVenue(false)
    if (error) { alert(`Could not add venue: ${error.message}`); return }
    setVName(''); setVAddress(''); setVPhotos(false)
    await loadAll()
  }
  async function toggleVenue(id: string, active: boolean) {
    await supabase.from('venues').update({ active }).eq('id', id)
    await loadAll()
  }

  // ----- session (rota) actions -----
  async function addSession() {
    if (!sTitle.trim() || !sDate || !sVenue || !sInstructor) {
      alert('Title, date, venue and instructor are required.')
      return
    }
    setSavingSession(true)
    const { data: created, error } = await supabase.from('sessions').insert({
      title: sTitle.trim(),
      date: sDate,
      time: sTime || null,
      venue_id: sVenue,
      instructor_id: sInstructor,
      status: 'upcoming',
    }).select('id').single()

    if (error || !created) {
      setSavingSession(false)
      alert(`Could not add session: ${error?.message}`)
      return
    }

    // Additional (co-)instructors who should also see this session
    const extras = sCoInstructors.filter(id => id && id !== sInstructor)
    if (extras.length > 0) {
      await supabase.from('session_instructors').insert(
        extras.map(id => ({ session_id: created.id, instructor_id: id }))
      )
    }

    // Auto-fill this session with the venue's roster students
    const { data: roster } = await supabase
      .from('rosters')
      .select('full_name, parent_email, level')
      .eq('venue_id', sVenue)
      .eq('active', true)

    if (roster && roster.length > 0) {
      await supabase.from('students').insert(
        roster.map(r => ({
          session_id: created.id,
          full_name: r.full_name,
          parent_email: r.parent_email,
          level: r.level,
        }))
      )
    }

    setSavingSession(false)
    const n = roster?.length ?? 0
    alert(n > 0 ? `Session added with ${n} students from the roster.` : 'Session added (no roster set for this venue yet).')
    setSTitle(''); setSDate(''); setSTime(''); setSVenue(''); setSInstructor(''); setSCoInstructors([])
    await loadAll()
  }
  async function deleteSession(id: string) {
    if (!confirm('Delete this session from the rota?')) return
    await supabase.from('sessions').delete().eq('id', id)
    await loadAll()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const instructorName = (id?: string | null) =>
    profiles.find(p => p.id === id)?.full_name || profiles.find(p => p.id === id)?.email || '—'

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-indigo-900">Admin</h1>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">← Dashboard</Link>
        </div>

        {/* ===== Instructors ===== */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Instructors</h2>

          <p className="text-sm text-gray-500 mb-3">
            Add an instructor by email below. They can then sign in with Google and they&apos;re in — no Google Console needed.
          </p>

          {/* Add instructor by email */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input value={iEmail} onChange={e => setIEmail(e.target.value)} placeholder="instructor@gmail.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Name (optional)</label>
              <input value={iName} onChange={e => setIName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
              <select value={iRole} onChange={e => setIRole(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="instructor">Instructor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button onClick={addInstructor} disabled={savingInvite} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {savingInvite ? 'Adding...' : 'Add instructor'}
            </button>
          </div>

          <div className="space-y-2">
            {profiles.map(p => {
              const removed = p.active === false
              return (
                <div key={p.id} className={`flex items-center justify-between p-3 border rounded-lg ${removed ? 'border-gray-200 bg-gray-50' : 'border-gray-100'}`}>
                  <div>
                    <p className={`font-medium ${removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{p.full_name || '(no name)'}</p>
                    <p className="text-xs text-gray-500">{p.email} · {p.role}{removed ? ' · removed' : ''}</p>
                  </div>
                  {p.id === meId ? (
                    <span className="text-xs text-gray-400 font-medium">You</span>
                  ) : removed ? (
                    <button onClick={() => setActive(p.id, true)} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Restore</button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRole(p.id, p.role === 'admin' ? 'instructor' : 'admin')}
                        className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                      >
                        {p.role === 'admin' ? 'Make instructor' : 'Make admin'}
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${p.full_name || p.email}'s access?`)) setActive(p.id, false) }}
                        className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {profiles.length === 0 && <p className="text-sm text-gray-400">No instructors yet.</p>}
          </div>
        </section>

        {/* ===== Venues ===== */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Venues</h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
              <input value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Hornsey Centre" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
              <input value={vAddress} onChange={e => setVAddress(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input type="checkbox" checked={vPhotos} onChange={e => setVPhotos(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              Photos
            </label>
            <button onClick={addVenue} disabled={savingVenue} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {savingVenue ? 'Adding...' : 'Add venue'}
            </button>
          </div>

          <div className="space-y-2">
            {venues.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                <div>
                  <p className={`font-medium ${v.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{v.name}</p>
                  <p className="text-xs text-gray-500">{v.address}{v.requires_photos ? ' · photos required' : ''}</p>
                </div>
                <button onClick={() => toggleVenue(v.id, !v.active)} className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  {v.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
            {venues.length === 0 && <p className="text-sm text-gray-400">No venues yet.</p>}
          </div>
        </section>

        {/* ===== Weekly rota ===== */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Weekly rota</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Instructor</label>
              <select value={sInstructor} onChange={e => setSInstructor(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">— Select instructor —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Venue</label>
              <select value={sVenue} onChange={e => setSVenue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">— Select venue —</option>
                {venues.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
              <input value={sTitle} onChange={e => setSTitle(e.target.value)} placeholder="e.g. Intermediate Coding" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Time</label>
                <input type="time" value={sTime} onChange={e => setSTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
              </div>
            </div>
          </div>

          {/* Additional instructors — all assigned instructors see this session */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Additional instructors (optional)</label>
            <div className="flex flex-wrap gap-3">
              {profiles.filter(p => p.id !== sInstructor).map(p => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600"
                    checked={sCoInstructors.includes(p.id)}
                    onChange={e => setSCoInstructors(prev =>
                      e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                    )}
                  />
                  {p.full_name || p.email}
                </label>
              ))}
              {profiles.filter(p => p.id !== sInstructor).length === 0 && (
                <span className="text-xs text-gray-400">No other instructors yet.</span>
              )}
            </div>
          </div>

          <button onClick={addSession} disabled={savingSession} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 mb-5">
            {savingSession ? 'Adding...' : 'Add to rota'}
          </button>

          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500">
                    {s.date}{s.time ? ` ${s.time}` : ''} · {s.venues?.name || '—'} · {instructorName(s.instructor_id)}
                  </p>
                </div>
                <button onClick={() => deleteSession(s.id)} className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50">Delete</button>
              </div>
            ))}
            {sessions.length === 0 && <p className="text-sm text-gray-400">No sessions scheduled.</p>}
          </div>
        </section>

        {/* ===== Class rosters ===== */}
        <div className="mt-6">
          <ImportStudents venues={venues} onChanged={loadAll} />
        </div>
      </div>
    </main>
  )
}
