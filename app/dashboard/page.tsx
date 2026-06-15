'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setLoading(false)
    }
    loadProfile()
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-indigo-900">
              🤖🧠 RoboIQ Hub
            </h1>
            <p className="text-gray-500">
              Welcome, <strong>{profile?.full_name}</strong> · {profile?.role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">
            {profile?.role === 'admin' ? 'Admin Dashboard' : 'My Sessions'}
          </h2>
          <p className="text-gray-600">
            {profile?.role === 'admin'
              ? "You're logged in as admin. Tomorrow you'll see all sessions across all instructors."
              : "You're logged in as an instructor. Tomorrow you'll see your assigned sessions."}
          </p>

          <p className="text-sm text-gray-400 mt-6">
            Day 3 ✅ — Auth working
          </p>
        </div>
      </div>
    </main>
  )
}