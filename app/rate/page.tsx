'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function RatePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="bg-white px-6 py-6 text-center border-b-[3px] border-[#4d8f0f]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/creative-iq-logo.png" alt="Creative IQ" className="mx-auto w-36 h-auto" />
          <p className="text-gray-500 text-xs font-bold tracking-widest mt-2">RATE YOUR EXPERIENCE</p>
        </div>
        <Suspense fallback={<div className="p-6 text-gray-500">Loading…</div>}>
          <RateForm />
        </Suspense>
      </div>
    </main>
  )
}

function RateForm() {
  const searchParams = useSearchParams()
  const childName = searchParams.get('n') || undefined
  const sessionTitle = searchParams.get('se') || undefined

  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [parentName, setParentName] = useState('')
  const [recommend, setRecommend] = useState(true)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!rating) { setError('Please tap a star to rate.'); return }
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/submit-rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childName, sessionTitle, rating, parentName, recommend, comments }),
    })
    const result = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) { setError(result.error || 'Something went wrong. Please try again.'); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="p-8 text-center">
        <p className="text-4xl mb-3">🎉</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
        <p className="text-gray-600 text-sm">Your feedback has been sent to the Creative IQ team.</p>
      </div>
    )
  }

  return (
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
        <span className="text-sm text-gray-700">I&apos;d recommend Creative IQ to other parents</span>
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
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {submitting ? 'Sending…' : 'Submit rating'}
      </button>

      <p className="text-center text-xs text-gray-400">
        For queries, email info@creative-iq.co.uk
      </p>
    </div>
  )
}
