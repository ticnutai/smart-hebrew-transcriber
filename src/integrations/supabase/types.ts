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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      migration_logs: {
        Row: {
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          file_name: string | null
          id: string
          result: string | null
          sql_content: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          file_name?: string | null
          id?: string
          result?: string | null
          sql_content: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          file_name?: string | null
          id?: string
          result?: string | null
          sql_content?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shared_transcripts: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          share_token: string
          transcript_id: string
          user_id: string
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          share_token?: string
          transcript_id: string
          user_id: string
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          share_token?: string
          transcript_id?: string
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_transcripts_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_secrets: {
        Row: {
          created_at: string | null
          key: string
          value: string
        }
        Insert: {
          created_at?: string | null
          key: string
          value: string
        }
        Update: {
          created_at?: string | null
          key?: string
          value?: string
        }
        Relationships: []
      }
      transcription_jobs: {
        Row: {
          completed_chunks: number | null
          created_at: string
          engine: string
          error_message: string | null
          file_name: string | null
          file_path: string | null
          id: string
          language: string | null
          partial_result: string | null
          progress: number | null
          result_text: string | null
          status: string
          total_chunks: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_chunks?: number | null
          created_at?: string
          engine?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          language?: string | null
          partial_result?: string | null
          progress?: number | null
          result_text?: string | null
          status?: string
          total_chunks?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_chunks?: number | null
          created_at?: string
          engine?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          language?: string | null
          partial_result?: string | null
          progress?: number | null
          result_text?: string | null
          status?: string
          total_chunks?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          audio_file_path: string | null
          category: string | null
          created_at: string
          edited_text: string | null
          engine: string
          folder: string | null
          id: string
          is_favorite: boolean | null
          notes: string | null
          tags: string[] | null
          text: string
          title: string | null
          updated_at: string
          user_id: string
          word_timings: Json | null
        }
        Insert: {
          audio_file_path?: string | null
          category?: string | null
          created_at?: string
          edited_text?: string | null
          engine?: string
          folder?: string | null
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          tags?: string[] | null
          text: string
          title?: string | null
          updated_at?: string
          user_id: string
          word_timings?: Json | null
        }
        Update: {
          audio_file_path?: string | null
          category?: string | null
          created_at?: string
          edited_text?: string | null
          engine?: string
          folder?: string | null
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          tags?: string[] | null
          text?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          word_timings?: Json | null
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          assemblyai_key: string | null
          claude_key: string | null
          created_at: string
          deepgram_key: string | null
          google_key: string | null
          groq_key: string | null
          id: string
          openai_key: string | null
          updated_at: string
          user_identifier: string
        }
        Insert: {
          assemblyai_key?: string | null
          claude_key?: string | null
          created_at?: string
          deepgram_key?: string | null
          google_key?: string | null
          groq_key?: string | null
          id?: string
          openai_key?: string | null
          updated_at?: string
          user_identifier: string
        }
        Update: {
          assemblyai_key?: string | null
          claude_key?: string | null
          created_at?: string
          deepgram_key?: string | null
          google_key?: string | null
          groq_key?: string | null
          id?: string
          openai_key?: string | null
          updated_at?: string
          user_identifier?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          custom_themes: Json | null
          draft_text: string | null
          editor_columns: number | null
          engine: string | null
          font_family: string | null
          font_size: number | null
          id: string
          line_height: number | null
          sidebar_pinned: boolean | null
          source_language: string | null
          text_color: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_themes?: Json | null
          draft_text?: string | null
          editor_columns?: number | null
          engine?: string | null
          font_family?: string | null
          font_size?: number | null
          id?: string
          line_height?: number | null
          sidebar_pinned?: boolean | null
          source_language?: string | null
          text_color?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_themes?: Json | null
          draft_text?: string | null
          editor_columns?: number | null
          engine?: string | null
          font_family?: string | null
          font_size?: number | null
          id?: string
          line_height?: number | null
          sidebar_pinned?: boolean | null
          source_language?: string | null
          text_color?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      deploy_edge_fn: {
        Args: { p_slug: string; p_source_code: string }
        Returns: Json
      }
      exec_sql: { Args: { query: string }; Returns: Json }
      exec_sql_return: { Args: { query: string }; Returns: Json }
      execute_sql_admin: { Args: { sql_text: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
