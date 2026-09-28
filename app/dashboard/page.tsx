'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Profile, Session, SessionInstructor } from '@/lib/types'
import Link from 'next/link'

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
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

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      // Load sessions with venue info
      const { data: sessionsData } = await supabase
  .from('sessions')
  .select(`
    *,
    venues ( name, brand, requires_photos ),
    session_instructors (
      profiles ( id, full_name )
    )
  `)
  .order('date', { ascending: true })

      setSessions(sessionsData || [])
      setLoading(false)
    }
    loadData()
  }, [])

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-indigo-900">
              Creative IQ Hub
            </h1>
            <p className="text-gray-500">
              Welcome, <strong>{profile?.full_name}</strong>
              <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                {profile?.role}
              </span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>

        {/* Sessions count */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <p className="text-gray-600">
            <strong className="text-indigo-900 text-lg">{sessions.length}</strong>
            {' '}sessions {profile?.role === 'admin' ? 'in total' : 'assigned to you'}
          </p>
        </div>

        {/* Sessions */}
        {sessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-purple-900 mb-3">
              Sessions
            </h2>
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