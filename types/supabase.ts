// Auto-generated Supabase types
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
// This is a placeholder — replace with generated types after Supabase project setup

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          full_name: string | null;
          avatar_url: string | null;
          streak_count: number;
          xp_total: number;
          level: number;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          streak_count?: number;
          xp_total?: number;
          level?: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          streak_count?: number;
          xp_total?: number;
          level?: number;
        };
      };
      tasks: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          title: string;
          completed: boolean;
          completed_at: string | null;
          date: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          title: string;
          completed?: boolean;
          completed_at?: string | null;
          date: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          title?: string;
          completed?: boolean;
          completed_at?: string | null;
          date?: string;
        };
      };
      focus_sessions: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          duration_minutes: number;
          completed: boolean;
          ended_early: boolean;
          xp_earned: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          duration_minutes: number;
          completed?: boolean;
          ended_early?: boolean;
          xp_earned?: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          duration_minutes?: number;
          completed?: boolean;
          ended_early?: boolean;
          xp_earned?: number;
        };
      };
      mood_checkins: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          mood: number;
          triggers: string[];
          note: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          mood: number;
          triggers?: string[];
          note?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          mood?: number;
          triggers?: string[];
          note?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
