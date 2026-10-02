export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  active: boolean | null
}

export interface Venue {
  name: string | null
  brand: string | null
  requires_photos: boolean | null
}

// Full venue table row (used in the admin area)
export interface VenueRow {
  id: string
  name: string | null
  address: string | null
  brand: string | null
  requires_photos: boolean | null
  active: boolean | null
}

export interface SessionInstructor {
  profiles: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Session {
  id: string
  title: string | null
  date: string | null
  time: string | null
  status: string | null
  photo_drive_link: string | null
  instructor_id?: string | null
  venue_id?: string | null
  venues: Venue | null
  session_instructors?: SessionInstructor[] | null
}

export interface Student {
  id: string
  session_id: string
  full_name: string | null
  parent_email: string | null
  attended: boolean | null
  lesson_focus: string | null
  level: string | null
  day_number: string | null
  is_repeat: boolean | null
  understanding_score: number | null
  time_intro_score: string | null
  time_build_score: string | null
  time_play_score: string | null
  troubleshooting_score: number | null
  design_score: number | null
  learn_more_about: string | null
  what_learned_today: string | null
  instructor_remarks: string | null
  drive_link: string | null
  feedback_sent_at: string | null
}

export type StudentFieldValue = string | number | boolean | null
