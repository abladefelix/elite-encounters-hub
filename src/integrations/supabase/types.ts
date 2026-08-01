export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          area: string
          created_at: string
          details: Json
          id: string
          note: string
          target: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          area: string
          created_at?: string
          details?: Json
          id?: string
          note?: string
          target?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          area?: string
          created_at?: string
          details?: Json
          id?: string
          note?: string
          target?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          admin_note: string
          applied_role: Database["public"]["Enums"]["app_role"]
          background_check: Database["public"]["Enums"]["background_check"]
          city: string
          created_at: string
          email: string
          full_name: string
          id: string
          id_verified: boolean
          phone: string
          pitch: string
          reference_checks: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["vetting_status"]
          suggested_room: Database["public"]["Enums"]["tier"]
          updated_at: string
          user_id: string | null
          years_experience: number
        }
        Insert: {
          admin_note?: string
          applied_role?: Database["public"]["Enums"]["app_role"]
          background_check?: Database["public"]["Enums"]["background_check"]
          city?: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          id_verified?: boolean
          phone?: string
          pitch?: string
          reference_checks?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["vetting_status"]
          suggested_room?: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id?: string | null
          years_experience?: number
        }
        Update: {
          admin_note?: string
          applied_role?: Database["public"]["Enums"]["app_role"]
          background_check?: Database["public"]["Enums"]["background_check"]
          city?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          id_verified?: boolean
          phone?: string
          pitch?: string
          reference_checks?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["vetting_status"]
          suggested_room?: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id?: string | null
          years_experience?: number
        }
        Relationships: []
      }
      bookings: {
        Row: {
          addons: string[]
          client_id: string
          created_at: string
          hours: number
          id: string
          notes: string
          platform_fee_pct: number
          rate: number
          scheduled_for: string | null
          service_id: string | null
          service_name: string
          specialist_id: string
          status: Database["public"]["Enums"]["booking_status"]
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          addons?: string[]
          client_id: string
          created_at?: string
          hours?: number
          id?: string
          notes?: string
          platform_fee_pct?: number
          rate?: number
          scheduled_for?: string | null
          service_id?: string | null
          service_name?: string
          specialist_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          addons?: string[]
          client_id?: string
          created_at?: string
          hours?: number
          id?: string
          notes?: string
          platform_fee_pct?: number
          rate?: number
          scheduled_for?: string | null
          service_id?: string | null
          service_name?: string
          specialist_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_entries: {
        Row: {
          admin_note: string
          amount: number
          booking_id: string | null
          client_id: string
          created_at: string
          dispute_reason: string | null
          disputed_at: string | null
          gift_key: string | null
          hold_hours: number
          id: string
          kind: Database["public"]["Enums"]["escrow_kind"]
          label: string
          paid_at: string | null
          payout_amount: number
          paystack_reference: string | null
          platform_fee: number
          release_at: string | null
          released_at: string | null
          specialist_id: string
          state: Database["public"]["Enums"]["escrow_state"]
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string
          amount: number
          booking_id?: string | null
          client_id: string
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          gift_key?: string | null
          hold_hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["escrow_kind"]
          label?: string
          paid_at?: string | null
          payout_amount?: number
          paystack_reference?: string | null
          platform_fee?: number
          release_at?: string | null
          released_at?: string | null
          specialist_id: string
          state?: Database["public"]["Enums"]["escrow_state"]
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string
          amount?: number
          booking_id?: string | null
          client_id?: string
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          gift_key?: string | null
          hold_hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["escrow_kind"]
          label?: string
          paid_at?: string | null
          payout_amount?: number
          paystack_reference?: string | null
          platform_fee?: number
          release_at?: string | null
          released_at?: string | null
          specialist_id?: string
          state?: Database["public"]["Enums"]["escrow_state"]
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_entries_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_keys: {
        Row: {
          created_at: string
          description: string
          id: string
          is_secret: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_secret?: boolean
          key: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_secret?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          amount: number
          created_at: string
          current_period_end: string | null
          id: string
          paystack_reference: string | null
          room: Database["public"]["Enums"]["tier"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          paystack_reference?: string | null
          room: Database["public"]["Enums"]["tier"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          paystack_reference?: string | null
          room?: Database["public"]["Enums"]["tier"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          author_id: string | null
          body: string
          booking_id: string | null
          created_at: string
          escrow_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          redacted: boolean
          thread_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          author_id?: string | null
          body?: string
          booking_id?: string | null
          created_at?: string
          escrow_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          redacted?: boolean
          thread_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          author_id?: string | null
          body?: string
          booking_id?: string | null
          created_at?: string
          escrow_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          redacted?: boolean
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_hits: {
        Row: {
          action: string
          author_id: string | null
          categories: string[]
          created_at: string
          id: string
          original_body: string
          reviewed: boolean
          terms: string[]
          thread_id: string | null
        }
        Insert: {
          action?: string
          author_id?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          original_body?: string
          reviewed?: boolean
          terms?: string[]
          thread_id?: string | null
        }
        Update: {
          action?: string
          author_id?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          original_body?: string
          reviewed?: boolean
          terms?: string[]
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_hits_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_hits_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          data: Json
          id: boolean
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: boolean
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          available: boolean
          avatar_url: string | null
          bio: string
          city: string
          created_at: string
          dislikes: string[]
          display_name: string
          headline: string
          hourly_rate: number
          id: string
          jobs_completed: number
          languages: string[]
          last_seen_at: string | null
          likes: string[]
          phone: string | null
          rating: number
          response_minutes: number
          room: Database["public"]["Enums"]["tier"] | null
          suspended: boolean
          updated_at: string
          verified: boolean
          vetting: Database["public"]["Enums"]["vetting_status"]
          years_experience: number
        }
        Insert: {
          available?: boolean
          avatar_url?: string | null
          bio?: string
          city?: string
          created_at?: string
          dislikes?: string[]
          display_name?: string
          headline?: string
          hourly_rate?: number
          id: string
          jobs_completed?: number
          languages?: string[]
          last_seen_at?: string | null
          likes?: string[]
          phone?: string | null
          rating?: number
          response_minutes?: number
          room?: Database["public"]["Enums"]["tier"] | null
          suspended?: boolean
          updated_at?: string
          verified?: boolean
          vetting?: Database["public"]["Enums"]["vetting_status"]
          years_experience?: number
        }
        Update: {
          available?: boolean
          avatar_url?: string | null
          bio?: string
          city?: string
          created_at?: string
          dislikes?: string[]
          display_name?: string
          headline?: string
          hourly_rate?: number
          id?: string
          jobs_completed?: number
          languages?: string[]
          last_seen_at?: string | null
          likes?: string[]
          phone?: string | null
          rating?: number
          response_minutes?: number
          room?: Database["public"]["Enums"]["tier"] | null
          suspended?: boolean
          updated_at?: string
          verified?: boolean
          vetting?: Database["public"]["Enums"]["vetting_status"]
          years_experience?: number
        }
        Relationships: []
      }
      ratings: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          note: string
          rated_id: string
          rater_id: string
          stars: number
          tags: string[]
          thread_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note?: string
          rated_id: string
          rater_id: string
          stars: number
          tags?: string[]
          thread_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note?: string
          rated_id?: string
          rater_id?: string
          stars?: number
          tags?: string[]
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rated_id_fkey"
            columns: ["rated_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_note: string
          blocked: boolean
          created_at: string
          excerpt: string
          id: string
          notes: string
          reason: string
          reported_id: string
          reporter_id: string
          state: Database["public"]["Enums"]["report_state"]
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string
          blocked?: boolean
          created_at?: string
          excerpt?: string
          id?: string
          notes?: string
          reason: string
          reported_id: string
          reporter_id: string
          state?: Database["public"]["Enums"]["report_state"]
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string
          blocked?: boolean
          created_at?: string
          excerpt?: string
          id?: string
          notes?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          state?: Database["public"]["Enums"]["report_state"]
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          base_rate: number
          category: string
          created_at: string
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_rate?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_rate?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      specialist_services: {
        Row: {
          created_at: string
          id: string
          service_id: string
          specialist_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
          specialist_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
          specialist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialist_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialist_services_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          client_id: string
          client_last_read_at: string
          contact_exempt: boolean
          created_at: string
          id: string
          last_message: string
          last_message_at: string
          room: Database["public"]["Enums"]["tier"] | null
          specialist_id: string
          specialist_last_read_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          client_last_read_at?: string
          contact_exempt?: boolean
          created_at?: string
          id?: string
          last_message?: string
          last_message_at?: string
          room?: Database["public"]["Enums"]["tier"] | null
          specialist_id: string
          specialist_last_read_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_last_read_at?: string
          contact_exempt?: boolean
          created_at?: string
          id?: string
          last_message?: string
          last_message_at?: string
          room?: Database["public"]["Enums"]["tier"] | null
          specialist_id?: string
          specialist_last_read_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_room: {
        Args: never
        Returns: Database["public"]["Enums"]["tier"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_thread: { Args: { _thread_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "client" | "specialist" | "admin"
      background_check: "clear" | "pending" | "flagged"
      booking_status:
        | "requested"
        | "accepted"
        | "paid"
        | "completed"
        | "cancelled"
        | "disputed"
      escrow_kind: "booking" | "gift" | "membership"
      escrow_state:
        | "pending"
        | "held"
        | "clearing"
        | "released"
        | "disputed"
        | "refunded"
      membership_status: "active" | "past_due" | "cancelled"
      message_kind: "text" | "system" | "booking" | "gift"
      report_state: "open" | "reviewing" | "actioned" | "dismissed"
      tier: "basic" | "premium" | "ultimate"
      vetting_status: "pending" | "in_review" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["client", "specialist", "admin"],
      background_check: ["clear", "pending", "flagged"],
      booking_status: [
        "requested",
        "accepted",
        "paid",
        "completed",
        "cancelled",
        "disputed",
      ],
      escrow_kind: ["booking", "gift", "membership"],
      escrow_state: [
        "pending",
        "held",
        "clearing",
        "released",
        "disputed",
        "refunded",
      ],
      membership_status: ["active", "past_due", "cancelled"],
      message_kind: ["text", "system", "booking", "gift"],
      report_state: ["open", "reviewing", "actioned", "dismissed"],
      tier: ["basic", "premium", "ultimate"],
      vetting_status: ["pending", "in_review", "approved", "rejected"],
    },
  },
} as const
