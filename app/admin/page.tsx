'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Profile, VenueRow, Session, Organization } from '@/lib/types'
import Link from 'next/link'
import ImportStudents from './ImportStudents'

interface Invite { email: string; full_name: string | null; role: string | null }

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [meId, setMeId] = useState<string | null>(null)
  const [isSuper, setIsSuper] = useState(false)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
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

  // Edit-session state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eDate, setEDate] = useState('')
  const [eTime, setETime] = useState('')
  const [eInstructor, setEInstructor] = useState('')
  const [eCoInstructors, setECoInstructors] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Pupils on the session being edited
  const [eStudents, setEStudents] = useState<{ id: string; full_name: string; parent_email: string | null; level: string | null }[]>([])
  const [nsName, setNsName] = useState('')
  const [nsEmail, setNsEmail] = useState('')
  const [nsLevel, setNsLevel] = useState('')

  async function loadAll(orgId?: string | null) {
    const oid = orgId !== undefined ? orgId : activeOrg?.id ?? null

    // Instructor pool = everyone who is a MEMBER of the active brand.
    // (An instructor can be a member of several brands at once.)
    let memberIds: string[] | null = null
    if (oid) {
      const { data: mem } = await supabase.from('memberships').select('user_id').eq('org_id', oid)
      memberIds = (mem || []).map(m => m.user_id)
    }

    let pq = supabase.from('profiles').select('*').order('email')
    if (memberIds) {
      // guard against an empty IN() list (matches nothing cleanly)
      pq = pq.in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'])
    }
    let vq = supabase.from('venues').select('*').order('name')
    let sq = supabase.from('sessions').select('*, venues ( name )').order('date', { ascending: true })
    let iq = supabase.from('instructor_invites').select('*').order('email')
    if (oid) {
      vq = vq.eq('org_id', oid)
      sq = sq.eq('org_id', oid)
      iq = iq.eq('org_id', oid)
    }
    const [{ data: profs }, { data: vens }, { data: sess }, { data: invs }] = await Promise.all([pq, vq, sq, iq])
    setProfiles(profs || [])
    setVenues(vens || [])
    setSessions(sess || [])
    setInvites(invs || [])
  }

  async function removeInvite(email: string) {
    // only this brand's pending invite — they may be invited to the other brand too
    let q = supabase.from('instructor_invites').delete().ilike('email', email)
    if (activeOrg?.id) q = q.eq('org_id', activeOrg.id)
    await q
    await loadAll()
  }

  function switchOrg(id: string) {
    try { localStorage.setItem('activeOrgId', id) } catch {}
    window.location.reload()
  }

  // Add an instructor by email to the ACTIVE brand. Works even if they already
  // work for the other brand — they simply gain a membership here too.
  async function addInstructor() {
    const email = iEmail.trim().toLowerCase()
    if (!email) { alert('Enter the instructor\'s email.'); return }
    if (!activeOrg?.id) { alert('Pick a brand first.'); return }
    setSavingInvite(true)

    // Look up ANY existing profile with this email (across all brands —
    // admins can read every profile, so this finds cross-brand people).
    const { data: prof } = await supabase
      .from('profiles').select('id').ilike('email', email).maybeSingle()

    if (prof) {
      // They've signed in before — reactivate + add a membership for this brand.
      await supabase.from('profiles').update({ active: true }).eq('id', prof.id)
      const { error } = await supabase
        .from('memberships')
        .upsert({ user_id: prof.id, org_id: activeOrg.id, role: iRole }, { onConflict: 'user_id,org_id' })
      if (error) { setSavingInvite(false); alert(`Could not add instructor: ${error.message}`); return }
    } else {
      // Not signed in yet — pending invite for THIS brand only (keeps any
      // invite they may already have for the other brand).
      const { data: existingInv } = await supabase
        .from('instructor_invites').select('email')
        .ilike('email', email).eq('org_id', activeOrg.id).maybeSingle()
      if (existingInv) {
        await supabase.from('instructor_invites')
          .update({ full_name: iName.trim() || null, role: iRole })
          .ilike('email', email).eq('org_id', activeOrg.id)
      } else {
        const { error } = await supabase
          .from('instructor_invites')
          .insert({ email, full_name: iName.trim() || null, role: iRole, org_id: activeOrg.id })
        if (error) { setSavingInvite(false); alert(`Could not add instructor: ${error.message}`); return }
      }
    }

    setSavingInvite(false)
    setIEmail(''); setIName(''); setIRole('instructor')
    alert(prof
      ? `Added to ${activeOrg.name}.`
      : `Invited to ${activeOrg.name} — they can sign in with Google now.`)
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
        .select('role, org_id, is_super')
        .eq('id', user.id)
        .single()

      if (!me || me.role !== 'admin') {
        router.push('/dashboard')
        return
      }

      setMeId(user.id)
      const sup = !!me.is_super
      setIsSuper(sup)

      // Resolve the active brand
      const { data: orgList } = await supabase.from('organizations').select('*').order('name')
      const allOrgs = orgList || []
      setOrgs(allOrgs)
      let activeId: string | null = me.org_id ?? null
      if (sup) {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null
        activeId = stored && allOrgs.some(o => o.id === stored)
          ? stored
          : (allOrgs.find(o => o.slug === 'creative-iq')?.id ?? allOrgs[0]?.id ?? activeId)
      }
      setActiveOrg(allOrgs.find(o => o.id === activeId) ?? null)

      await loadAll(activeId)
      setLoading(false)
    }
    init()
  }, [])

  // ----- instructor actions -----
  // Remove from the ACTIVE brand only. They keep access to any other brand.
  async function removeFromBrand(id: string, label: string) {
    if (!activeOrg?.id) return
    if (!confirm(`Remove ${label} from ${activeOrg.name}? They'll keep access to any other brand they're in.`)) return
    await supabase.from('memberships').delete().eq('user_id', id).eq('org_id', activeOrg.id)

    // Repoint their home brand / sign-in if needed.
    const { data: remaining } = await supabase.from('memberships').select('org_id').eq('user_id', id)
    const orgs = remaining || []
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', id).single()
    const stillHasHome = prof?.org_id && orgs.some(o => o.org_id === prof.org_id)
    await supabase.from('profiles').update({
      active: orgs.length > 0,                    // no brands left ⇒ fully revoke sign-in
      org_id: orgs.length === 0 ? null : (stillHasHome ? prof!.org_id : orgs[0].org_id),
    }).eq('id', id)
    await loadAll()
  }
  async function restoreToBrand(id: string) {
    if (!activeOrg?.id) return
    await supabase.from('memberships')
      .upsert({ user_id: id, org_id: activeOrg.id, role: 'instructor' }, { onConflict: 'user_id,org_id' })
    await supabase.from('profiles').update({ active: true }).eq('id', id)
    await loadAll()
  }
  async function setRole(id: string, role: string) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    // keep their membership role for this brand in sync
    if (activeOrg?.id) await supabase.from('memberships').update({ role }).eq('user_id', id).eq('org_id', activeOrg.id)
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
      org_id: activeOrg?.id ?? null,
      brand: activeOrg?.slug === 'robothink' ? 'robothink' : 'creative_iq',
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
      org_id: activeOrg?.id ?? null,
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
          org_id: activeOrg?.id ?? null,
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

  async function startEdit(s: Session) {
    setEditingId(s.id)
    setETitle(s.title || '')
    setEDate(s.date || '')
    setETime(s.time || '')
    setEInstructor(s.instructor_id || '')
    setNsName(''); setNsEmail(''); setNsLevel('')
    const { data: co } = await supabase.from('session_instructors').select('instructor_id').eq('session_id', s.id)
    setECoInstructors((co || []).map(c => c.instructor_id as string))
    await loadSessionStudents(s.id)
  }
  function cancelEdit() { setEditingId(null); setEStudents([]) }

  // ----- pupils on a session (rota) -----
  async function loadSessionStudents(sessionId: string) {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, parent_email, level')
      .eq('session_id', sessionId)
      .order('full_name')
    setEStudents(data || [])
  }
  async function addStudentToSession(sessionId: string) {
    const name = nsName.trim()
    if (!name) { alert('Enter the pupil\'s name.'); return }
    const { error } = await supabase.from('students').insert({
      session_id: sessionId,
      full_name: name,
      parent_email: nsEmail.trim() || null,
      level: nsLevel.trim() || null,
      org_id: activeOrg?.id ?? null,
    })
    if (error) { alert(`Could not add pupil: ${error.message}`); return }
    setNsName(''); setNsEmail(''); setNsLevel('')
    await loadSessionStudents(sessionId)
  }
  async function deleteStudentFromSession(studentId: string, sessionId: string) {
    if (!confirm('Remove this pupil from the session?')) return
    await supabase.from('students').delete().eq('id', studentId)
    await loadSessionStudents(sessionId)
  }
  async function saveEdit(id: string) {
    if (!eTitle.trim() || !eDate || !eInstructor) { alert('Title, date and primary instructor are required.'); return }
    setSavingEdit(true)
    await supabase.from('sessions').update({
      title: eTitle.trim(),
      date: eDate,
      time: eTime || null,
      instructor_id: eInstructor,
    }).eq('id', id)
    // Sync co-instructors: clear then re-add (excluding the primary)
    await supabase.from('session_instructors').delete().eq('session_id', id)
    const extras = eCoInstructors.filter(x => x && x !== eInstructor)
    if (extras.length > 0) {
      await supabase.from('session_instructors').insert(extras.map(x => ({ session_id: id, instructor_id: x })))
    }
    setSavingEdit(false)
    setEditingId(null)
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
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {activeOrg?.logo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeOrg.logo_path} alt={activeOrg.name} className="h-9 w-auto" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            {isSuper && orgs.length > 1 && (
              <select
                value={activeOrg?.id ?? ''}
                onChange={e => switchOrg(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-800"
                title="Switch brand"
              >
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">← Dashboard</Link>
          </div>
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

          {invites.length > 0 && (
            <>
              <p className="text-sm font-semibold text-indigo-700 mb-2">Invited — awaiting first sign-in ({invites.length})</p>
              <div className="space-y-2 mb-5">
                {invites.map(inv => (
                  <div key={inv.email} className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{inv.full_name || inv.email}</p>
                      <p className="text-xs text-gray-500">{inv.email} · {inv.role}</p>
                    </div>
                    <button onClick={() => removeInvite(inv.email)} className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50">Remove</button>
                  </div>
                ))}
              </div>
            </>
          )}

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
                    <button onClick={() => restoreToBrand(p.id)} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Restore</button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRole(p.id, p.role === 'admin' ? 'instructor' : 'admin')}
                        className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                      >
                        {p.role === 'admin' ? 'Make instructor' : 'Make admin'}
                      </button>
                      <button
                        onClick={() => removeFromBrand(p.id, p.full_name || p.email || 'this instructor')}
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
              editingId === s.id ? (
                <div key={s.id} className="p-3 border border-indigo-200 bg-indigo-50/40 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={eTitle} onChange={e => setETitle(e.target.value)} placeholder="Title" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    <select value={eInstructor} onChange={e => setEInstructor(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                      <option value="">— Primary instructor —</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                    </select>
                    <input type="date" value={eDate} onChange={e => setEDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    <input type="time" value={eTime} onChange={e => setETime(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Additional instructors</p>
                    <div className="flex flex-wrap gap-3">
                      {profiles.filter(p => p.id !== eInstructor).map(p => (
                        <label key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                          <input type="checkbox" className="w-4 h-4 accent-indigo-600"
                            checked={eCoInstructors.includes(p.id)}
                            onChange={ev => setECoInstructors(prev => ev.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                          {p.full_name || p.email}
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Pupils on this session */}
                  <div className="border-t border-indigo-200 pt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Pupils ({eStudents.length})</p>
                    <div className="space-y-1.5 mb-3">
                      {eStudents.map(st => (
                        <div key={st.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                          <div className="min-w-0">
                            <span className="text-sm text-gray-900">{st.full_name}</span>
                            {st.level ? <span className="text-xs text-gray-400 ml-2">{st.level}</span> : null}
                            {st.parent_email ? <span className="text-xs text-gray-400 ml-2 truncate">· {st.parent_email}</span> : <span className="text-xs text-amber-600 ml-2">· no parent email</span>}
                          </div>
                          <button onClick={() => deleteStudentFromSession(st.id, s.id)} className="text-xs text-red-600 hover:text-red-800 px-2 shrink-0" title="Remove pupil">✕</button>
                        </div>
                      ))}
                      {eStudents.length === 0 && <p className="text-xs text-gray-400">No pupils on this session yet.</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input value={nsName} onChange={e => setNsName(e.target.value)} placeholder="Pupil name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                      <input value={nsEmail} onChange={e => setNsEmail(e.target.value)} placeholder="Parent email" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                      <input value={nsLevel} onChange={e => setNsLevel(e.target.value)} placeholder="Level (optional)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    </div>
                    <button onClick={() => addStudentToSession(s.id)} className="mt-2 text-sm border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50">+ Add pupil</button>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(s.id)} disabled={savingEdit} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{savingEdit ? 'Saving...' : 'Save'}</button>
                    <button onClick={cancelEdit} className="text-sm border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={s.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-500">
                      {s.date}{s.time ? ` ${s.time}` : ''} · {s.venues?.name || '—'} · {instructorName(s.instructor_id)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(s)} className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">Edit</button>
                    <button onClick={() => deleteSession(s.id)} className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50">Delete</button>
                  </div>
                </div>
              )
            ))}
            {sessions.length === 0 && <p className="text-sm text-gray-400">No sessions scheduled.</p>}
          </div>
        </section>

        {/* ===== Class rosters ===== */}
        <div className="mt-6">
          <ImportStudents venues={venues} orgId={activeOrg?.id ?? null} onChanged={() => loadAll()} />
        </div>
      </div>
    </main>
  )
}
