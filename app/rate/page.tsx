'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Brand {
  name: string
  logo_path: string
  accent_color: string
  contact_email: string
}

const DEFAULT_BRAND: Brand = {
  name: 'Creative IQ',
  logo_path: '/creative-iq-logo.png',
  accent_color: '#4d8f0f',
  contact_email: 'info@creative-iq.co.uk',
}

export default function RatePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <Suspense fallback={<div className="text-gray-500">Loading…</div>}>
        <RateForm />
      </Suspense>
    </main>
  )
}

function RateForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const childName = searchParams.get('n') || undefined
  const sessionTitle = searchParams.get('se') || undefined
  const brandSlug = searchParams.get('b') || 'creative-iq'

  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [parentName, setParentName] = useState('')
  const [recommend, setRecommend] = useState(true)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadBrand() {
      const { data } = await supabase
        .from('organizations')
        .select('name, logo_path, accent_color, contact_email')
        .eq('slug', brandSlug)
        .single()
      if (data) {
        setBrand({
          name: data.name || DEFAULT_BRAND.name,
          logo_path: data.logo_path || DEFAULT_BRAND.logo_path,
          accent_color: data.accent_color || DEFAULT_BRAND.accent_color,
          contact_email: data.contact_email || DEFAULT_BRAND.contact_email,
        })
      }
    }
    loadBrand()
  }, [brandSlug, supabase])

  async function submit() {
    if (!rating) { setError('Please tap a star to rate.'); return }
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/submit-rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: brandSlug, childName, sessionTitle, rating, parentName, recommend, comments }),
    })
    const result = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) { setError(result.error || 'Something went wrong. Please try again.'); return }
    setDone(true)
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
      <div className="bg-white px-6 py-6 text-center" style={{ borderBottom: `3px solid ${brand.accent_color}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo_path} alt={brand.name} className="mx-auto h-14 w-auto" />
        <p className="text-gray-500 text-xs font-bold tracking-widest mt-2">RATE YOUR EXPERIENCE</p>
      </div>

      {done ? (
        <div className="p-8 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
          <p className="text-gray-600 text-sm">Your feedback has been sent to the {brand.name} team.</p>
        </div>
      ) : (
        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">How was your child&apos;s experience?</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(star)}
                  className={`text-4xl transition ${(hover || rating) >= star ? 'text-amber-400' : 'text-gray-300'} hover:scale-110`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Your name (optional)</label>
            <input
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Parent / guardian name"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={recommend} onChange={e => setRecommend(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            <span className="text-sm text-gray-700">I&apos;d recommend {brand.name} to other parents</span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Comments (optional)</label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
              placeholder="Tell us what you thought…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition"
            style={{ background: brand.accent_color }}
          >
            {submitting ? 'Sending…' : 'Submit rating'}
          </button>

          <p className="text-center text-xs text-gray-400">
            For queries, email {brand.contact_email}
          </p>
        </div>
      )}
    </div>
  )
}
