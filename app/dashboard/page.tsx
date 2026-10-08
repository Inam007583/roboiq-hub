'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Profile, Session, SessionInstructor, Organization } from '@/lib/types'
import Link from 'next/link'

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData && profileData.active === false) {
        await supabase.auth.signOut()
        router.push('/login?error=' + encodeURIComponent('Your access has been removed. Please contact your admin.'))
        return
      }
      setProfile(profileData)

      // Resolve the active brand
      const { data: orgList } = await supabase.from('organizations').select('*').order('name')
      const allOrgs = orgList || []
      setOrgs(allOrgs)
      const isSuper = !!profileData?.is_super
      let activeId: string | null = profileData?.org_id ?? null
      if (isSuper) {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null
        activeId = stored && allOrgs.some(o => o.id === stored)
          ? stored
          : (allOrgs.find(o => o.slug === 'creative-iq')?.id ?? allOrgs[0]?.id ?? activeId)
      }
      setActiveOrg(allOrgs.find(o => o.id === activeId) ?? null)

      // Sessions for the active brand (RLS also restricts to what the user may see)
      let q = supabase
        .from('sessions')
        .select(`*, venues ( name, brand, requires_photos ), session_instructors ( profiles ( id, full_name ) )`)
        .order('date', { ascending: true })
      if (activeId) q = q.eq('org_id', activeId)
      const { data: sessionsData } = await q

      setSessions(sessionsData || [])
      setLoading(false)
    }
    loadData()
  }, [])

  function switchOrg(id: string) {
    try { localStorage.setItem('activeOrgId', id) } catch {}
    window.location.reload()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const isSuper = !!profile?.is_super

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {activeOrg?.logo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeOrg.logo_path} alt={activeOrg.name} className="h-10 w-auto" />
            )}
            <div>
              <p className="text-gray-500 text-sm">
                Welcome, <strong>{profile?.full_name}</strong>
                <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-medium">
                  {profile?.role}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
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
            {profile?.role === 'admin' && (
              <Link href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Admin</Link>
            )}
            <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-900">Sign out</button>
          </div>
        </div>

        {/* Sessions count */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <p className="text-gray-600">
            <strong className="text-gray-900 text-lg">{sessions.length}</strong>
            {' '}sessions {profile?.role === 'admin' ? 'in total' : 'assigned to you'}
          </p>
        </div>

        {sessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Sessions</h2>
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500">
            No sessions yet.
          </div>
        )}
      </div>
    </main>
  )
}

function SessionCard({ session }: { session: Session }) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block bg-white rounded-xl shadow-sm hover:shadow-md transition p-5 border border-gray-100"
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {session.venues?.name}
            {session.session_instructors && session.session_instructors.length > 0 && (
  <span> · {session.session_instructors.map((si: SessionInstructor) => si.profiles?.full_name).filter(Boolean).join(', ')}</span>
)}
          </p>
          {session.venues?.requires_photos && (
            <p className="text-xs text-purple-700 mt-1">Photos required</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-medium text-gray-900">{session.date}</p>
          <p className="text-sm text-gray-500">{session.time}</p>
          <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            session.status === 'upcoming'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {session.status}
          </span>
        </div>
      </div>
    </Link>
  )
}
