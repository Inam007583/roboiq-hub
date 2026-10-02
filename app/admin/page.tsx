'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Profile, VenueRow, Session } from '@/lib/types'
import Link from 'next/link'

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [sessions, setSessions] = useState<Session[]>([])

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

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: me } = await supabase
        .from('profiles')
        .select('role, active')
        .eq('id', user.id)
        .single()

      if (!me || !me.active) {
        await supabase.auth.signOut()
        router.push('/login?error=' + encodeURIComponent('Your account is pending approval. Please contact your admin.'))
        return
      }
      if (me.role !== 'admin') {
        router.push('/dashboard')
        return
      }

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
    const { error } = await supabase.from('sessions').insert({
      title: sTitle.trim(),
      date: sDate,
      time: sTime || null,
      venue_id: sVenue,
      instructor_id: sInstructor,
      status: 'upcoming',
    })
    setSavingSession(false)
    if (error) { alert(`Could not add session: ${error.message}`); return }
    setSTitle(''); setSDate(''); setSTime(''); setSVenue(''); setSInstructor('')
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

  const pending = profiles.filter(p => !p.active)
  const approved = profiles.filter(p => p.active)
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

          {pending.length > 0 && (
            <>
              <p className="text-sm font-semibold text-amber-700 mb-2">Pending approval ({pending.length})</p>
              <div className="space-y-2 mb-5">
                {pending.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{p.full_name || '(no name)'}</p>
                      <p className="text-xs text-gray-500">{p.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActive(p.id, true)} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-sm font-semibold text-gray-700 mb-2">Approved ({approved.length})</p>
          <div className="space-y-2">
            {approved.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{p.full_name || '(no name)'}</p>
                  <p className="text-xs text-gray-500">{p.email} · {p.role}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRole(p.id, p.role === 'admin' ? 'instructor' : 'admin')}
                    className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    {p.role === 'admin' ? 'Make instructor' : 'Make admin'}
                  </button>
                  <button onClick={() => setActive(p.id, false)} className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50">Revoke</button>
                </div>
              </div>
            ))}
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
                {approved.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
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
      </div>
    </main>
  )
}
