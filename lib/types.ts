export interface Profile {
  id: string
  full_name: string | null
  role: string | null
}

export interface Venue {
  name: string | null
  brand: string | null
  requires_photos: boolean | null
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
  time_intro_score: number | null
  time_build_score: number | null
  time_play_score: number | null
  troubleshooting_score: number | null
  design_score: number | null
  learn_more_about: string | null
  what_learned_today: string | null
  instructor_remarks: string | null
  feedback_sent_at: string | null
}

export type StudentFieldValue = string | number | boolean | null
