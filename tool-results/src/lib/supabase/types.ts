/**
 * Supa AI — Hand-written Supabase database type map.
 *
 * Mirrors the SQL schema in `supabase/migrations/0001_init.sql`. Acts as the
 * generic parameter for every `SupabaseClient<Database>` so Postgrest queries
 * are fully typed end-to-end (insert, select, update) without codegen.
 *
 * NOTE: Keep this file in sync with the SQL migrations. When a migration adds
 * a column/table, update the corresponding `Row`/`Insert`/`Update` here.
 *
 * @module @/lib/supabase/types
 */

/** Postgres representation of a UUID. */
type Uuid = string;
/** Postgres representation of a JSON/JSONB column. */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Canonical Supabase database schema.
 *
 * @see https://supabase.com/docs/reference/javascript/typescript-support
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: Uuid;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          role: string;
          platform_role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: Uuid;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          platform_role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          platform_role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organizations: {
        Row: {
          id: Uuid;
          name: string | null;
          slug: string | null;
          owner_id: Uuid | null;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name?: string | null;
          slug?: string | null;
          owner_id?: Uuid | null;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string | null;
          slug?: string | null;
          owner_id?: Uuid | null;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organization_members: {
        Row: {
          id: Uuid;
          org_id: Uuid;
          user_id: Uuid;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          org_id: Uuid;
          user_id: Uuid;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          org_id?: Uuid;
          user_id?: Uuid;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: Uuid;
          org_id: Uuid | null;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          status: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          org_id?: Uuid | null;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          org_id?: Uuid | null;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      usage_records: {
        Row: {
          id: Uuid;
          org_id: Uuid | null;
          user_id: Uuid | null;
          feature: string | null;
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          org_id?: Uuid | null;
          user_id?: Uuid | null;
          feature?: string | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cost_cents?: number | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          org_id?: Uuid | null;
          user_id?: Uuid | null;
          feature?: string | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cost_cents?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      api_keys: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          name: string | null;
          key_prefix: string | null;
          hashed_key: string | null;
          last_used_at: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          name?: string | null;
          key_prefix?: string | null;
          hashed_key?: string | null;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          name?: string | null;
          key_prefix?: string | null;
          hashed_key?: string | null;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };

      ai_conversations: {
        Row: {
          id: Uuid;
          user_id: Uuid | null;
          org_id: Uuid | null;
          title: string | null;
          provider: string | null;
          model: string | null;
          metadata: Json | null;
          folder_id: Uuid | null;
          pinned: boolean;
          archived: boolean;
          system_prompt: string | null;
          last_message_preview: string | null;
          last_message_at: string | null;
          message_count: number;
          total_tokens: number;
          total_cost_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id?: Uuid | null;
          org_id?: Uuid | null;
          title?: string | null;
          provider?: string | null;
          model?: string | null;
          metadata?: Json | null;
          folder_id?: Uuid | null;
          pinned?: boolean;
          archived?: boolean;
          system_prompt?: string | null;
          last_message_preview?: string | null;
          last_message_at?: string | null;
          message_count?: number;
          total_tokens?: number;
          total_cost_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid | null;
          org_id?: Uuid | null;
          title?: string | null;
          provider?: string | null;
          model?: string | null;
          metadata?: Json | null;
          folder_id?: Uuid | null;
          pinned?: boolean;
          archived?: boolean;
          system_prompt?: string | null;
          last_message_preview?: string | null;
          last_message_at?: string | null;
          message_count?: number;
          total_tokens?: number;
          total_cost_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      ai_messages: {
        Row: {
          id: Uuid;
          conversation_id: Uuid;
          role: "system" | "user" | "assistant" | "tool";
          content: Json | null;
          tokens: number | null;
          provider: string | null;
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          cost_cents: number | null;
          latency_ms: number | null;
          finish_reason: string | null;
          error_message: string | null;
          edit_history: Json | null;
          parent_message_id: Uuid | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          conversation_id: Uuid;
          role: "system" | "user" | "assistant" | "tool";
          content?: Json | null;
          tokens?: number | null;
          provider?: string | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          cost_cents?: number | null;
          latency_ms?: number | null;
          finish_reason?: string | null;
          error_message?: string | null;
          edit_history?: Json | null;
          parent_message_id?: Uuid | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          conversation_id?: Uuid;
          role?: "system" | "user" | "assistant" | "tool";
          content?: Json | null;
          tokens?: number | null;
          provider?: string | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          cost_cents?: number | null;
          latency_ms?: number | null;
          finish_reason?: string | null;
          error_message?: string | null;
          edit_history?: Json | null;
          parent_message_id?: Uuid | null;
          created_at?: string;
        };
        Relationships: [];
      };

      files: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          org_id: Uuid | null;
          storage_path: string;
          filename: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          org_id?: Uuid | null;
          storage_path: string;
          filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          org_id?: Uuid | null;
          storage_path?: string;
          filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 3: AI Chat Engine tables
      // (see supabase/migrations/0005_phase3_chat.sql)
      // ------------------------------------------------------------------

      conversation_folders: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          name: string;
          color: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          name: string;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          name?: string;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      message_attachments: {
        Row: {
          id: Uuid;
          message_id: Uuid;
          file_id: Uuid;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          message_id: Uuid;
          file_id: Uuid;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          message_id?: Uuid;
          file_id?: Uuid;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      prompt_templates: {
        Row: {
          id: Uuid;
          user_id: Uuid | null;
          title: string;
          description: string | null;
          category: string;
          content: string;
          variables: Json | null;
          is_favorite: boolean;
          is_public: boolean;
          sort_order: number;
          usage_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id?: Uuid | null;
          title: string;
          description?: string | null;
          category?: string;
          content: string;
          variables?: Json | null;
          is_favorite?: boolean;
          is_public?: boolean;
          sort_order?: number;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid | null;
          title?: string;
          description?: string | null;
          category?: string;
          content?: string;
          variables?: Json | null;
          is_favorite?: boolean;
          is_public?: boolean;
          sort_order?: number;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      ai_models: {
        Row: {
          id: Uuid;
          provider: string;
          model_id: string;
          label: string;
          context_window: number | null;
          max_output_tokens: number | null;
          input_cost_cents_per_1k: number | null;
          output_cost_cents_per_1k: number | null;
          capabilities: Json | null;
          is_enabled: boolean;
          is_default: boolean;
          sort_order: number;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          provider: string;
          model_id: string;
          label: string;
          context_window?: number | null;
          max_output_tokens?: number | null;
          input_cost_cents_per_1k?: number | null;
          output_cost_cents_per_1k?: number | null;
          capabilities?: Json | null;
          is_enabled?: boolean;
          is_default?: boolean;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          provider?: string;
          model_id?: string;
          label?: string;
          context_window?: number | null;
          max_output_tokens?: number | null;
          input_cost_cents_per_1k?: number | null;
          output_cost_cents_per_1k?: number | null;
          capabilities?: Json | null;
          is_enabled?: boolean;
          is_default?: boolean;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      provider_health: {
        Row: {
          id: Uuid;
          provider: string;
          status: "healthy" | "degraded" | "down" | "unknown";
          success_count: number;
          error_count: number;
          avg_latency_ms: number | null;
          last_check_at: string | null;
          last_error: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          provider: string;
          status?: "healthy" | "degraded" | "down" | "unknown";
          success_count?: number;
          error_count?: number;
          avg_latency_ms?: number | null;
          last_check_at?: string | null;
          last_error?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          provider?: string;
          status?: "healthy" | "degraded" | "down" | "unknown";
          success_count?: number;
          error_count?: number;
          avg_latency_ms?: number | null;
          last_check_at?: string | null;
          last_error?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      ai_usage: {
        Row: {
          id: Uuid;
          user_id: Uuid | null;
          org_id: Uuid | null;
          conversation_id: Uuid | null;
          message_id: Uuid | null;
          provider: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cost_cents: number;
          latency_ms: number | null;
          feature: string;
          status: "success" | "error" | "timeout" | "rate_limited";
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id?: Uuid | null;
          org_id?: Uuid | null;
          conversation_id?: Uuid | null;
          message_id?: Uuid | null;
          provider: string;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          cost_cents?: number;
          latency_ms?: number | null;
          feature?: string;
          status?: "success" | "error" | "timeout" | "rate_limited";
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid | null;
          org_id?: Uuid | null;
          conversation_id?: Uuid | null;
          message_id?: Uuid | null;
          provider?: string;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          cost_cents?: number;
          latency_ms?: number | null;
          feature?: string;
          status?: "success" | "error" | "timeout" | "rate_limited";
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 9C: AI Employees tables
      // (see supabase/migrations/0014_phase9c_employees.sql)
      // ------------------------------------------------------------------

      ai_employees: {
        Row: { id: Uuid; workspace_id: Uuid | null; name: string; avatar_url: string | null; role: string; department: string; description: string | null; status: string; experience_level: string; system_prompt: string | null; permissions: Json; tools: Json; is_template: boolean; is_public: boolean; version: number; metadata: Json | null; created_by: Uuid | null; created_at: string; updated_at: string; };
        Insert: { id?: Uuid; workspace_id?: Uuid | null; name: string; avatar_url?: string | null; role: string; department?: string; description?: string | null; status?: string; experience_level?: string; system_prompt?: string | null; permissions?: Json; tools?: Json; is_template?: boolean; is_public?: boolean; version?: number; metadata?: Json | null; created_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Update: { id?: Uuid; workspace_id?: Uuid | null; name?: string; avatar_url?: string | null; role?: string; department?: string; description?: string | null; status?: string; experience_level?: string; system_prompt?: string | null; permissions?: Json; tools?: Json; is_template?: boolean; is_public?: boolean; version?: number; metadata?: Json | null; created_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      employee_skills: {
        Row: { id: Uuid; employee_id: Uuid; skill_name: string; proficiency: number; is_primary: boolean; config: Json; created_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; skill_name: string; proficiency?: number; is_primary?: boolean; config?: Json; created_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; skill_name?: string; proficiency?: number; is_primary?: boolean; config?: Json; created_at?: string; };
        Relationships: [];
      };
      employee_memory: {
        Row: { id: Uuid; employee_id: Uuid; workspace_id: Uuid | null; memory_type: string; key: string; value: Json; importance: number; expires_at: string | null; metadata: Json | null; created_at: string; updated_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; workspace_id?: Uuid | null; memory_type: string; key: string; value: Json; importance?: number; expires_at?: string | null; metadata?: Json | null; created_at?: string; updated_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; workspace_id?: Uuid | null; memory_type?: string; key?: string; value?: Json; importance?: number; expires_at?: string | null; metadata?: Json | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      employee_training: {
        Row: { id: Uuid; employee_id: Uuid; workspace_id: Uuid | null; source_type: string; source_id: Uuid | null; source_url: string | null; title: string; content_hash: string | null; status: string; chunk_count: number; error_message: string | null; trained_by: Uuid | null; created_at: string; updated_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; workspace_id?: Uuid | null; source_type: string; source_id?: Uuid | null; source_url?: string | null; title: string; content_hash?: string | null; status?: string; chunk_count?: number; error_message?: string | null; trained_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; workspace_id?: Uuid | null; source_type?: string; source_id?: Uuid | null; source_url?: string | null; title?: string; content_hash?: string | null; status?: string; chunk_count?: number; error_message?: string | null; trained_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      employee_departments: {
        Row: { id: Uuid; workspace_id: Uuid | null; name: string; label: string; description: string | null; icon: string | null; color: string | null; sort_order: number; is_active: boolean; created_at: string; updated_at: string; };
        Insert: { id?: Uuid; workspace_id?: Uuid | null; name: string; label: string; description?: string | null; icon?: string | null; color?: string | null; sort_order?: number; is_active?: boolean; created_at?: string; updated_at?: string; };
        Update: { id?: Uuid; workspace_id?: Uuid | null; name?: string; label?: string; description?: string | null; icon?: string | null; color?: string | null; sort_order?: number; is_active?: boolean; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      employee_assignments: {
        Row: { id: Uuid; employee_id: Uuid; workspace_id: Uuid; assigned_by: Uuid | null; role_override: string | null; status: string; assigned_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; workspace_id: Uuid; assigned_by?: Uuid | null; role_override?: string | null; status?: string; assigned_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; workspace_id?: Uuid; assigned_by?: Uuid | null; role_override?: string | null; status?: string; assigned_at?: string; };
        Relationships: [];
      };
      employee_performance: {
        Row: { id: Uuid; employee_id: Uuid; workspace_id: Uuid | null; metric_date: string; tasks_completed: number; tasks_failed: number; success_rate: number; avg_response_ms: number | null; credits_consumed: number; cost_cents: number; total_tokens: number; workflow_participations: number; user_rating: number | null; error_count: number; metadata: Json | null; created_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; workspace_id?: Uuid | null; metric_date?: string; tasks_completed?: number; tasks_failed?: number; success_rate?: number; avg_response_ms?: number | null; credits_consumed?: number; cost_cents?: number; total_tokens?: number; workflow_participations?: number; user_rating?: number | null; error_count?: number; metadata?: Json | null; created_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; workspace_id?: Uuid | null; metric_date?: string; tasks_completed?: number; tasks_failed?: number; success_rate?: number; avg_response_ms?: number | null; credits_consumed?: number; cost_cents?: number; total_tokens?: number; workflow_participations?: number; user_rating?: number | null; error_count?: number; metadata?: Json | null; created_at?: string; };
        Relationships: [];
      };
      employee_messages: {
        Row: { id: Uuid; workspace_id: Uuid; from_employee_id: Uuid; to_employee_id: Uuid; message_type: string; content: string; context: Json | null; status: string; parent_id: Uuid | null; created_at: string; };
        Insert: { id?: Uuid; workspace_id: Uuid; from_employee_id: Uuid; to_employee_id: Uuid; message_type?: string; content: string; context?: Json | null; status?: string; parent_id?: Uuid | null; created_at?: string; };
        Update: { id?: Uuid; workspace_id?: Uuid; from_employee_id?: Uuid; to_employee_id?: Uuid; message_type?: string; content?: string; context?: Json | null; status?: string; parent_id?: Uuid | null; created_at?: string; };
        Relationships: [];
      };
      employee_marketplace: {
        Row: { id: Uuid; employee_id: Uuid; title: string; description: string; category: string; tags: string[]; icon: string | null; featured: boolean; install_count: number; rating: number; review_count: number; version: string; is_published: boolean; published_by: Uuid | null; created_at: string; updated_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; title: string; description: string; category: string; tags?: string[]; icon?: string | null; featured?: boolean; install_count?: number; rating?: number; review_count?: number; version?: string; is_published?: boolean; published_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; title?: string; description?: string; category?: string; tags?: string[]; icon?: string | null; featured?: boolean; install_count?: number; rating?: number; review_count?: number; version?: string; is_published?: boolean; published_by?: Uuid | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      employee_versions: {
        Row: { id: Uuid; employee_id: Uuid; version_number: number; snapshot: Json; changelog: string | null; created_by: Uuid | null; created_at: string; };
        Insert: { id?: Uuid; employee_id: Uuid; version_number: number; snapshot: Json; changelog?: string | null; created_by?: Uuid | null; created_at?: string; };
        Update: { id?: Uuid; employee_id?: Uuid; version_number?: number; snapshot?: Json; changelog?: string | null; created_by?: Uuid | null; created_at?: string; };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 5: AI Video Generation tables
      // (see supabase/migrations/0007_phase5_video.sql)
      // ------------------------------------------------------------------

      video_generations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          provider: string;
          model: string;
          prompt: string;
          type: "text-to-video" | "image-to-video" | "video-to-video";
          source_image_url: string | null;
          source_video_url: string | null;
          duration: number | null;
          fps: number | null;
          resolution: string | null;
          aspect_ratio: string | null;
          status:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          result_url: string | null;
          result_storage_path: string | null;
          error: string | null;
          credits_consumed: number;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          provider: string;
          model: string;
          prompt: string;
          type?:
            | "text-to-video"
            | "image-to-video"
            | "video-to-video";
          source_image_url?: string | null;
          source_video_url?: string | null;
          duration?: number | null;
          fps?: number | null;
          resolution?: string | null;
          aspect_ratio?: string | null;
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          result_url?: string | null;
          result_storage_path?: string | null;
          error?: string | null;
          credits_consumed?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          provider?: string;
          model?: string;
          prompt?: string;
          type?:
            | "text-to-video"
            | "image-to-video"
            | "video-to-video";
          source_image_url?: string | null;
          source_video_url?: string | null;
          duration?: number | null;
          fps?: number | null;
          resolution?: string | null;
          aspect_ratio?: string | null;
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          result_url?: string | null;
          result_storage_path?: string | null;
          error?: string | null;
          credits_consumed?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      video_models: {
        Row: {
          id: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description: string | null;
          max_duration: number | null;
          supported_resolutions: string[];
          supported_types: string[];
          is_active: boolean;
          sort_order: number;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description?: string | null;
          max_duration?: number | null;
          supported_resolutions?: string[];
          supported_types?: string[];
          is_active?: boolean;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          provider?: string;
          model_id?: string;
          name?: string;
          description?: string | null;
          max_duration?: number | null;
          supported_resolutions?: string[];
          supported_types?: string[];
          is_active?: boolean;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      video_uploads: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          duration: number | null;
          width: number | null;
          height: number | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          duration?: number | null;
          width?: number | null;
          height?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          mime_type?: string;
          duration?: number | null;
          width?: number | null;
          height?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      video_jobs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          generation_id: Uuid;
          provider: string;
          external_job_id: string | null;
          status:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          progress: number;
          result_url: string | null;
          error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          generation_id: Uuid;
          provider: string;
          external_job_id?: string | null;
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          progress?: number;
          result_url?: string | null;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          generation_id?: Uuid;
          provider?: string;
          external_job_id?: string | null;
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          progress?: number;
          result_url?: string | null;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_jobs_generation_id_fkey";
            columns: ["generation_id"];
            referencedRelation: "video_generations";
            referencedColumns: ["id"];
          },
        ];
      };

      video_usage: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          metric_date: string;
          videos_generated: number;
          credits_used: number;
          by_provider: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          metric_date?: string;
          videos_generated?: number;
          credits_used?: number;
          by_provider?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          metric_date?: string;
          videos_generated?: number;
          credits_used?: number;
          by_provider?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 7 / 9: Workspace & Collaboration tables
      // (see supabase/migrations/0009_phase7_workspace.sql)
      // ------------------------------------------------------------------

      workspaces: {
        Row: {
          id: Uuid;
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          type: "personal" | "team" | "organization";
          owner_id: Uuid;
          billing_owner_id: Uuid | null;
          settings: Json;
          storage_used_bytes: number;
          ai_credits_pool: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name: string;
          slug: string;
          description?: string | null;
          logo_url?: string | null;
          type?: "personal" | "team" | "organization";
          owner_id: Uuid;
          billing_owner_id?: Uuid | null;
          settings?: Json;
          storage_used_bytes?: number;
          ai_credits_pool?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string;
          slug?: string;
          description?: string | null;
          logo_url?: string | null;
          type?: "personal" | "team" | "organization";
          owner_id?: Uuid;
          billing_owner_id?: Uuid | null;
          settings?: Json;
          storage_used_bytes?: number;
          ai_credits_pool?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workspace_members: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          role: "owner" | "admin" | "editor" | "viewer" | "member";
          status: "active" | "invited" | "suspended" | "removed";
          invited_by: Uuid | null;
          invited_at: string;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          role?: "owner" | "admin" | "editor" | "viewer" | "member";
          status?: "active" | "invited" | "suspended" | "removed";
          invited_by?: Uuid | null;
          invited_at?: string;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          role?: "owner" | "admin" | "editor" | "viewer" | "member";
          status?: "active" | "invited" | "suspended" | "removed";
          invited_by?: Uuid | null;
          invited_at?: string;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      folders: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          parent_id: Uuid | null;
          name: string;
          path: string;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          parent_id?: Uuid | null;
          name: string;
          path?: string;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          parent_id?: Uuid | null;
          name?: string;
          path?: string;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      documents: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          folder_id: Uuid | null;
          title: string;
          content: string | null;
          content_type: "markdown" | "plain" | "html" | "json";
          status: "draft" | "published" | "archived";
          version: number;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          folder_id?: Uuid | null;
          title: string;
          content?: string | null;
          content_type?: "markdown" | "plain" | "html" | "json";
          status?: "draft" | "published" | "archived";
          version?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          folder_id?: Uuid | null;
          title?: string;
          content?: string | null;
          content_type?: "markdown" | "plain" | "html" | "json";
          status?: "draft" | "published" | "archived";
          version?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      document_versions: {
        Row: {
          id: Uuid;
          document_id: Uuid;
          version: number;
          content: string | null;
          changed_by: Uuid | null;
          changed_at: string;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          document_id: Uuid;
          version: number;
          content?: string | null;
          changed_by?: Uuid | null;
          changed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          document_id?: Uuid;
          version?: number;
          content?: string | null;
          changed_by?: Uuid | null;
          changed_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      comments: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          document_id: Uuid | null;
          parent_id: Uuid | null;
          author_id: Uuid;
          body: string;
          resolved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          document_id?: Uuid | null;
          parent_id?: Uuid | null;
          author_id: Uuid;
          body: string;
          resolved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          document_id?: Uuid | null;
          parent_id?: Uuid | null;
          author_id?: Uuid;
          body?: string;
          resolved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      knowledge_base: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          title: string;
          content: string | null;
          source: string | null;
          source_id: Uuid | null;
          source_type:
            | "document"
            | "file"
            | "url"
            | "manual"
            | "ai-generated"
            | null;
          tags: string[];
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          title: string;
          content?: string | null;
          source?: string | null;
          source_id?: Uuid | null;
          source_type?:
            | "document"
            | "file"
            | "url"
            | "manual"
            | "ai-generated"
            | null;
          tags?: string[];
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          title?: string;
          content?: string | null;
          source?: string | null;
          source_id?: Uuid | null;
          source_type?:
            | "document"
            | "file"
            | "url"
            | "manual"
            | "ai-generated"
            | null;
          tags?: string[];
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      file_library: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          folder_id: Uuid | null;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string | null;
          created_by: Uuid | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          folder_id?: Uuid | null;
          file_name: string;
          file_path: string;
          file_size?: number;
          mime_type?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          folder_id?: Uuid | null;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          mime_type?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
        };
        Relationships: [];
      };

      workspace_roles: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          permissions: Json;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          permissions?: Json;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          permissions?: Json;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workspace_activity: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid | null;
          action: string;
          resource_type: string | null;
          resource_id: Uuid | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id?: Uuid | null;
          action: string;
          resource_type?: string | null;
          resource_id?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid | null;
          action?: string;
          resource_type?: string | null;
          resource_id?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      workspace_mentions: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          document_id: Uuid | null;
          comment_id: Uuid | null;
          mentioned_user_id: Uuid;
          mentioned_by: Uuid | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          document_id?: Uuid | null;
          comment_id?: Uuid | null;
          mentioned_user_id: Uuid;
          mentioned_by?: Uuid | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          document_id?: Uuid | null;
          comment_id?: Uuid | null;
          mentioned_user_id?: Uuid;
          mentioned_by?: Uuid | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      workspace_invitations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          email: string;
          role: "owner" | "admin" | "editor" | "viewer" | "member";
          token: string;
          invited_by: Uuid;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          email: string;
          role?: "owner" | "admin" | "editor" | "viewer" | "member";
          token: string;
          invited_by: Uuid;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          email?: string;
          role?: "owner" | "admin" | "editor" | "viewer" | "member";
          token?: string;
          invited_by?: Uuid;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 2: Authentication & User Management tables
      // (see supabase/migrations/0004_phase2_auth.sql)
      // ------------------------------------------------------------------

      profiles: {
        Row: {
          id: Uuid;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          phone_number: string | null;
          country: string | null;
          time_zone: string;
          locale: string;
          bio: string | null;
          company: string | null;
          job_title: string | null;
          website: string | null;
          account_status:
            | "active"
            | "suspended"
            | "pending_verification"
            | "deleted";
          subscription_plan:
            | "free"
            | "starter"
            | "pro"
            | "business"
            | "enterprise";
          credits_balance: number;
          email_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: Uuid;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          phone_number?: string | null;
          country?: string | null;
          time_zone?: string;
          locale?: string;
          bio?: string | null;
          company?: string | null;
          job_title?: string | null;
          website?: string | null;
          account_status?:
            | "active"
            | "suspended"
            | "pending_verification"
            | "deleted";
          subscription_plan?:
            | "free"
            | "starter"
            | "pro"
            | "business"
            | "enterprise";
          credits_balance?: number;
          email_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          phone_number?: string | null;
          country?: string | null;
          time_zone?: string;
          locale?: string;
          bio?: string | null;
          company?: string | null;
          job_title?: string | null;
          website?: string | null;
          account_status?:
            | "active"
            | "suspended"
            | "pending_verification"
            | "deleted";
          subscription_plan?:
            | "free"
            | "starter"
            | "pro"
            | "business"
            | "enterprise";
          credits_balance?: number;
          email_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      user_settings: {
        Row: {
          id: Uuid;
          theme: "light" | "dark" | "system";
          density: "comfortable" | "compact";
          notification_email: boolean;
          notification_push: boolean;
          notification_marketing: boolean;
          notification_security: boolean;
          notification_product_updates: boolean;
          privacy_profile_visible: boolean;
          privacy_activity_visible: boolean;
          privacy_show_in_search: boolean;
          two_factor_enabled: boolean;
          session_timeout_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: Uuid;
          theme?: "light" | "dark" | "system";
          density?: "comfortable" | "compact";
          notification_email?: boolean;
          notification_push?: boolean;
          notification_marketing?: boolean;
          notification_security?: boolean;
          notification_product_updates?: boolean;
          privacy_profile_visible?: boolean;
          privacy_activity_visible?: boolean;
          privacy_show_in_search?: boolean;
          two_factor_enabled?: boolean;
          session_timeout_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          theme?: "light" | "dark" | "system";
          density?: "comfortable" | "compact";
          notification_email?: boolean;
          notification_push?: boolean;
          notification_marketing?: boolean;
          notification_security?: boolean;
          notification_product_updates?: boolean;
          privacy_profile_visible?: boolean;
          privacy_activity_visible?: boolean;
          privacy_show_in_search?: boolean;
          two_factor_enabled?: boolean;
          session_timeout_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      user_sessions: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          session_token_hash: string | null;
          user_agent: string | null;
          ip_address: string | null;
          device_type: string | null;
          os: string | null;
          browser: string | null;
          location: string | null;
          is_current: boolean;
          last_active_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          session_token_hash?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          device_type?: string | null;
          os?: string | null;
          browser?: string | null;
          location?: string | null;
          is_current?: boolean;
          last_active_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          session_token_hash?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          device_type?: string | null;
          os?: string | null;
          browser?: string | null;
          location?: string | null;
          is_current?: boolean;
          last_active_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      notifications: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          type: string;
          title: string;
          message: string;
          action_url: string | null;
          action_label: string | null;
          is_read: boolean;
          metadata: Json | null;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          type: string;
          title: string;
          message: string;
          action_url?: string | null;
          action_label?: string | null;
          is_read?: boolean;
          metadata?: Json | null;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          type?: string;
          title?: string;
          message?: string;
          action_url?: string | null;
          action_label?: string | null;
          is_read?: boolean;
          metadata?: Json | null;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [];
      };

      activity_logs: {
        Row: {
          id: Uuid;
          user_id: Uuid | null;
          event_type: string;
          severity: "debug" | "info" | "warn" | "error" | "critical";
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id?: Uuid | null;
          event_type: string;
          severity?: "debug" | "info" | "warn" | "error" | "critical";
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid | null;
          event_type?: string;
          severity?: "debug" | "info" | "warn" | "error" | "critical";
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      account_deletion_requests: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          request_type: "data_export" | "account_deletion";
          status:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          download_url: string | null;
          expires_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          request_type: "data_export" | "account_deletion";
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          download_url?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          request_type?: "data_export" | "account_deletion";
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          download_url?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      linked_accounts: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          provider: string;
          provider_account_id: string | null;
          provider_email: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          provider: string;
          provider_account_id?: string | null;
          provider_email?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          provider?: string;
          provider_account_id?: string | null;
          provider_email?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ====================================================================
      // Phase 8 — AI Voice Platform (0008_phase6_voice.sql)
      // ====================================================================

      voice_generations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid | null;
          user_id: Uuid;
          provider: string;
          model: string;
          type: "tts" | "stt" | "translate" | "dub" | "clone";
          text: string | null;
          voice_id: string | null;
          language: string | null;
          source_audio_url: string | null;
          result_url: string | null;
          result_storage_path: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "cancelled";
          error: string | null;
          credits_consumed: number;
          duration: number | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id: Uuid;
          provider: string;
          model: string;
          type: "tts" | "stt" | "translate" | "dub" | "clone";
          text?: string | null;
          voice_id?: string | null;
          language?: string | null;
          source_audio_url?: string | null;
          result_url?: string | null;
          result_storage_path?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          error?: string | null;
          credits_consumed?: number;
          duration?: number | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id?: Uuid;
          provider?: string;
          model?: string;
          type?: "tts" | "stt" | "translate" | "dub" | "clone";
          text?: string | null;
          voice_id?: string | null;
          language?: string | null;
          source_audio_url?: string | null;
          result_url?: string | null;
          result_storage_path?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          error?: string | null;
          credits_consumed?: number;
          duration?: number | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      voice_models: {
        Row: {
          id: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description: string | null;
          type: "tts" | "stt";
          supported_languages: string[] | null;
          supported_voices: Json | null;
          is_active: boolean;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description?: string | null;
          type: "tts" | "stt";
          supported_languages?: string[] | null;
          supported_voices?: Json | null;
          is_active?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          provider?: string;
          model_id?: string;
          name?: string;
          description?: string | null;
          type?: "tts" | "stt";
          supported_languages?: string[] | null;
          supported_voices?: Json | null;
          is_active?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      voice_profiles: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          name: string;
          provider: string;
          voice_id: string;
          language: string | null;
          settings: Json | null;
          is_cloned: boolean;
          sample_audio_url: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          name: string;
          provider: string;
          voice_id: string;
          language?: string | null;
          settings?: Json | null;
          is_cloned?: boolean;
          sample_audio_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          name?: string;
          provider?: string;
          voice_id?: string;
          language?: string | null;
          settings?: Json | null;
          is_cloned?: boolean;
          sample_audio_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      voice_transcripts: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          generation_id: Uuid;
          text: string;
          language: string | null;
          confidence: number | null;
          segments: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          generation_id: Uuid;
          text: string;
          language?: string | null;
          confidence?: number | null;
          segments?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          generation_id?: Uuid;
          text?: string;
          language?: string | null;
          confidence?: number | null;
          segments?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      audio_uploads: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          duration: number | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          duration?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          mime_type?: string;
          duration?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      voice_jobs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          generation_id: Uuid | null;
          provider: string;
          external_job_id: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "cancelled";
          progress: number;
          result_url: string | null;
          error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          generation_id?: Uuid | null;
          provider: string;
          external_job_id?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          progress?: number;
          result_url?: string | null;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          generation_id?: Uuid | null;
          provider?: string;
          external_job_id?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          progress?: number;
          result_url?: string | null;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      voice_usage: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          metric_date: string;
          generations: number;
          credits_used: number;
          by_type: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          user_id: Uuid;
          metric_date?: string;
          generations?: number;
          credits_used?: number;
          by_type?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          user_id?: Uuid;
          metric_date?: string;
          generations?: number;
          credits_used?: number;
          by_type?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 4: AI Image Generation tables
      // (see supabase/migrations/0006_phase4_images.sql)
      // ------------------------------------------------------------------

      image_generations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid | null;
          user_id: Uuid;
          provider: string;
          model: string;
          prompt: string;
          negative_prompt: string | null;
          style: string | null;
          size: string | null;
          quality: string | null;
          status:
            | "pending"
            | "processing"
            | "succeeded"
            | "failed"
            | "cancelled";
          result_url: string | null;
          result_storage_path: string | null;
          error: string | null;
          credits_consumed: number;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id: Uuid;
          provider: string;
          model: string;
          prompt: string;
          negative_prompt?: string | null;
          style?: string | null;
          size?: string | null;
          quality?: string | null;
          status?: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
          result_url?: string | null;
          result_storage_path?: string | null;
          error?: string | null;
          credits_consumed?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id?: Uuid;
          provider?: string;
          model?: string;
          prompt?: string;
          negative_prompt?: string | null;
          style?: string | null;
          size?: string | null;
          quality?: string | null;
          status?: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
          result_url?: string | null;
          result_storage_path?: string | null;
          error?: string | null;
          credits_consumed?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      image_models: {
        Row: {
          id: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description: string | null;
          max_size: string | null;
          supported_styles: string[] | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          provider: string;
          model_id: string;
          name: string;
          description?: string | null;
          max_size?: string | null;
          supported_styles?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          provider?: string;
          model_id?: string;
          name?: string;
          description?: string | null;
          max_size?: string | null;
          supported_styles?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      image_styles: {
        Row: {
          id: Uuid;
          key: string;
          name: string;
          description: string | null;
          category: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          key: string;
          name: string;
          description?: string | null;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          key?: string;
          name?: string;
          description?: string | null;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      image_uploads: {
        Row: {
          id: Uuid;
          workspace_id: Uuid | null;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          width: number | null;
          height: number | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id: Uuid;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          width?: number | null;
          height?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id?: Uuid;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          mime_type?: string;
          width?: number | null;
          height?: number | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      image_usage: {
        Row: {
          id: Uuid;
          workspace_id: Uuid | null;
          user_id: Uuid;
          metric_date: string;
          images_generated: number;
          credits_used: number;
          by_provider: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id: Uuid;
          metric_date?: string;
          images_generated?: number;
          credits_used?: number;
          by_provider?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          user_id?: Uuid;
          metric_date?: string;
          images_generated?: number;
          credits_used?: number;
          by_provider?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ------------------------------------------------------------------
      // Phase 9B: Visual Workflow Builder tables
      // (see supabase/migrations/0012_phase9b_builder.sql)
      // ------------------------------------------------------------------

      workflow_nodes: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          node_type:
            | "trigger"
            | "action"
            | "condition"
            | "transform"
            | "ai"
            | "integration"
            | "output";
          node_key: string;
          label: string;
          position: Json;
          config: Json;
          is_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          node_type:
            | "trigger"
            | "action"
            | "condition"
            | "transform"
            | "ai"
            | "integration"
            | "output";
          node_key: string;
          label?: string;
          position?: Json;
          config?: Json;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: string;
          node_type?:
            | "trigger"
            | "action"
            | "condition"
            | "transform"
            | "ai"
            | "integration"
            | "output";
          node_key?: string;
          label?: string;
          position?: Json;
          config?: Json;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_edges: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          source_node_id: Uuid;
          target_node_id: Uuid;
          source_port: string;
          target_port: string;
          label: string;
          condition: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          source_node_id: Uuid;
          target_node_id: Uuid;
          source_port?: string;
          target_port?: string;
          label?: string;
          condition?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: string;
          source_node_id?: Uuid;
          target_node_id?: Uuid;
          source_port?: string;
          target_port?: string;
          label?: string;
          condition?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_layouts: {
        Row: {
          id: Uuid;
          workflow_id: string;
          layout: Json;
          viewport: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workflow_id: string;
          layout?: Json;
          viewport?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workflow_id?: string;
          layout?: Json;
          viewport?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_comments: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          author_id: Uuid;
          body: string;
          position: Json;
          resolved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          author_id: Uuid;
          body: string;
          position?: Json;
          resolved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: string;
          author_id?: Uuid;
          body?: string;
          position?: Json;
          resolved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_collaboration: {
        Row: {
          id: Uuid;
          workflow_id: string;
          user_id: Uuid;
          cursor: Json;
          selected_nodes: string[];
          last_active: string;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workflow_id: string;
          user_id: Uuid;
          cursor?: Json;
          selected_nodes?: string[];
          last_active?: string;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workflow_id?: string;
          user_id?: Uuid;
          cursor?: Json;
          selected_nodes?: string[];
          last_active?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      workflow_debug_sessions: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          status: "idle" | "running" | "paused" | "completed";
          current_node_id: Uuid | null;
          variables: Json;
          log: Json;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: string;
          status?: "idle" | "running" | "paused" | "completed";
          current_node_id?: Uuid | null;
          variables?: Json;
          log?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: string;
          status?: "idle" | "running" | "paused" | "completed";
          current_node_id?: Uuid | null;
          variables?: Json;
          log?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      template_categories: {
        Row: {
          id: Uuid;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string;
          slug?: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ----------------------------------------------------------------------
      // Phase 9A — Automation Engine (mirrors 0011_phase9a_automation.sql)
      // ----------------------------------------------------------------------

      workflows: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          description: string | null;
          status: "active" | "paused" | "archived" | "draft";
          version: number;
          is_template: boolean;
          template_category: string | null;
          config: Json;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          description?: string | null;
          status?: "active" | "paused" | "archived" | "draft";
          version?: number;
          is_template?: boolean;
          template_category?: string | null;
          config?: Json;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          description?: string | null;
          status?: "active" | "paused" | "archived" | "draft";
          version?: number;
          is_template?: boolean;
          template_category?: string | null;
          config?: Json;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_triggers: {
        Row: {
          id: Uuid;
          workflow_id: Uuid;
          type: "schedule" | "event" | "webhook" | "manual" | "api";
          config: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workflow_id: Uuid;
          type: "schedule" | "event" | "webhook" | "manual" | "api";
          config?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workflow_id?: Uuid;
          type?: "schedule" | "event" | "webhook" | "manual" | "api";
          config?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_actions: {
        Row: {
          id: Uuid;
          workflow_id: Uuid;
          type: string;
          name: string;
          config: Json;
          order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workflow_id: Uuid;
          type: string;
          name: string;
          config?: Json;
          order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workflow_id?: Uuid;
          type?: string;
          name?: string;
          config?: Json;
          order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_runs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          trigger_id: Uuid | null;
          status: "pending" | "running" | "completed" | "failed" | "cancelled";
          started_at: string | null;
          completed_at: string | null;
          error: string | null;
          result: Json | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          trigger_id?: Uuid | null;
          status?: "pending" | "running" | "completed" | "failed" | "cancelled";
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          result?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: Uuid;
          trigger_id?: Uuid | null;
          status?: "pending" | "running" | "completed" | "failed" | "cancelled";
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          result?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      workflow_logs: {
        Row: {
          id: Uuid;
          run_id: Uuid;
          level: "debug" | "info" | "warn" | "error";
          message: string;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          run_id: Uuid;
          level?: "debug" | "info" | "warn" | "error";
          message: string;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          run_id?: Uuid;
          level?: "debug" | "info" | "warn" | "error";
          message?: string;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      workflow_variables: {
        Row: {
          id: Uuid;
          workflow_id: Uuid;
          key: string;
          value: string | null;
          type: "string" | "number" | "boolean" | "json" | "secret";
          is_secret: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workflow_id: Uuid;
          key: string;
          value?: string | null;
          type?: "string" | "number" | "boolean" | "json" | "secret";
          is_secret?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workflow_id?: Uuid;
          key?: string;
          value?: string | null;
          type?: "string" | "number" | "boolean" | "json" | "secret";
          is_secret?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      scheduled_jobs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          trigger_id: Uuid;
          next_run_at: string;
          last_run_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          trigger_id: Uuid;
          next_run_at: string;
          last_run_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: Uuid;
          trigger_id?: Uuid;
          next_run_at?: string;
          last_run_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      automation_templates: {
        Row: {
          id: Uuid;
          name: string;
          description: string | null;
          category: string;
          config: Json;
          is_featured: boolean;
          install_count: number;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name: string;
          description?: string | null;
          category?: string;
          config?: Json;
          is_featured?: boolean;
          install_count?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string;
          description?: string | null;
          category?: string;
          config?: Json;
          is_featured?: boolean;
          install_count?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      webhook_endpoints: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          url_slug: string;
          is_active: boolean;
          secret: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          workflow_id: Uuid;
          url_slug: string;
          is_active?: boolean;
          secret: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          workflow_id?: Uuid;
          url_slug?: string;
          is_active?: boolean;
          secret?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ---------------------------------------------------------------------
      // Phase 10 — Business AI Suite (migration 0010_phase8_business.sql).
      // 18 workspace-scoped tables: CRM, sales docs, inventory, accounting,
      // projects, calendar, transactions, and the workspace's own company
      // profile(s). Money columns are numeric(14,2).
      // ---------------------------------------------------------------------

      customers: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          status: string;
          customer_type: string;
          tags: string[];
          avatar_url: string | null;
          address: Json | null;
          metadata: Json | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          status?: string;
          customer_type?: string;
          tags?: string[];
          avatar_url?: string | null;
          address?: Json | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          status?: string;
          customer_type?: string;
          tags?: string[];
          avatar_url?: string | null;
          address?: Json | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      contacts: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          first_name: string;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          department: string | null;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          first_name: string;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          department?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          first_name?: string;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          department?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      leads: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          source: string;
          status: string;
          score: number;
          assigned_to: Uuid | null;
          converted_to_customer_id: Uuid | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          source?: string;
          status?: string;
          score?: number;
          assigned_to?: Uuid | null;
          converted_to_customer_id?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          source?: string;
          status?: string;
          score?: number;
          assigned_to?: Uuid | null;
          converted_to_customer_id?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      opportunities: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          lead_id: Uuid | null;
          name: string;
          amount: number;
          stage: string;
          probability: number;
          expected_close_date: string | null;
          assigned_to: Uuid | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          lead_id?: Uuid | null;
          name: string;
          amount?: number;
          stage?: string;
          probability?: number;
          expected_close_date?: string | null;
          assigned_to?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          lead_id?: Uuid | null;
          name?: string;
          amount?: number;
          stage?: string;
          probability?: number;
          expected_close_date?: string | null;
          assigned_to?: Uuid | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      invoices: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          number: string;
          status: string;
          issue_date: string;
          due_date: string | null;
          subtotal: number;
          tax: number;
          discount: number;
          total: number;
          currency: string;
          notes: string | null;
          items: Json;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          number: string;
          status?: string;
          issue_date?: string;
          due_date?: string | null;
          subtotal?: number;
          tax?: number;
          discount?: number;
          total?: number;
          currency?: string;
          notes?: string | null;
          items?: Json;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          number?: string;
          status?: string;
          issue_date?: string;
          due_date?: string | null;
          subtotal?: number;
          tax?: number;
          discount?: number;
          total?: number;
          currency?: string;
          notes?: string | null;
          items?: Json;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      quotations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          number: string;
          status: string;
          valid_until: string | null;
          subtotal: number;
          tax: number;
          discount: number;
          total: number;
          currency: string;
          items: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          number: string;
          status?: string;
          valid_until?: string | null;
          subtotal?: number;
          tax?: number;
          discount?: number;
          total?: number;
          currency?: string;
          items?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          number?: string;
          status?: string;
          valid_until?: string | null;
          subtotal?: number;
          tax?: number;
          discount?: number;
          total?: number;
          currency?: string;
          items?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      proposals: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          title: string;
          content: string | null;
          status: string;
          sent_at: string | null;
          accepted_at: string | null;
          expired_at: string | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          title: string;
          content?: string | null;
          status?: string;
          sent_at?: string | null;
          accepted_at?: string | null;
          expired_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          title?: string;
          content?: string | null;
          status?: string;
          sent_at?: string | null;
          accepted_at?: string | null;
          expired_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      contracts: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          title: string;
          content: string | null;
          status: string;
          start_date: string | null;
          end_date: string | null;
          value: number;
          signed_at: string | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          title: string;
          content?: string | null;
          status?: string;
          start_date?: string | null;
          end_date?: string | null;
          value?: number;
          signed_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          title?: string;
          content?: string | null;
          status?: string;
          start_date?: string | null;
          end_date?: string | null;
          value?: number;
          signed_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      receipts: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          customer_id: Uuid | null;
          invoice_id: Uuid | null;
          number: string;
          amount: number;
          payment_method: string;
          payment_date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          customer_id?: Uuid | null;
          invoice_id?: Uuid | null;
          number: string;
          amount?: number;
          payment_method?: string;
          payment_date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          customer_id?: Uuid | null;
          invoice_id?: Uuid | null;
          number?: string;
          amount?: number;
          payment_method?: string;
          payment_date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      expenses: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          category: string;
          amount: number;
          currency: string;
          date: string;
          vendor: string | null;
          description: string | null;
          status: string;
          approved_by: Uuid | null;
          approved_at: string | null;
          receipt_url: string | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          category?: string;
          amount?: number;
          currency?: string;
          date?: string;
          vendor?: string | null;
          description?: string | null;
          status?: string;
          approved_by?: Uuid | null;
          approved_at?: string | null;
          receipt_url?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          category?: string;
          amount?: number;
          currency?: string;
          date?: string;
          vendor?: string | null;
          description?: string | null;
          status?: string;
          approved_by?: Uuid | null;
          approved_at?: string | null;
          receipt_url?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      products: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          sku: string | null;
          description: string | null;
          price: number;
          cost: number;
          currency: string;
          stock: number;
          category: string | null;
          tags: string[];
          is_active: boolean;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          sku?: string | null;
          description?: string | null;
          price?: number;
          cost?: number;
          currency?: string;
          stock?: number;
          category?: string | null;
          tags?: string[];
          is_active?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          sku?: string | null;
          description?: string | null;
          price?: number;
          cost?: number;
          currency?: string;
          stock?: number;
          category?: string | null;
          tags?: string[];
          is_active?: boolean;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      suppliers: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          contact_person: string | null;
          terms: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          contact_person?: string | null;
          terms?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          contact_person?: string | null;
          terms?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      purchase_orders: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          supplier_id: Uuid | null;
          number: string;
          status: string;
          issue_date: string;
          expected_date: string | null;
          subtotal: number;
          tax: number;
          total: number;
          currency: string;
          items: Json;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          supplier_id?: Uuid | null;
          number: string;
          status?: string;
          issue_date?: string;
          expected_date?: string | null;
          subtotal?: number;
          tax?: number;
          total?: number;
          currency?: string;
          items?: Json;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          supplier_id?: Uuid | null;
          number?: string;
          status?: string;
          issue_date?: string;
          expected_date?: string | null;
          subtotal?: number;
          tax?: number;
          total?: number;
          currency?: string;
          items?: Json;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      projects: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          description: string | null;
          status: string;
          start_date: string | null;
          end_date: string | null;
          budget: number;
          client_id: Uuid | null;
          manager_id: Uuid | null;
          team: Json;
          progress: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          description?: string | null;
          status?: string;
          start_date?: string | null;
          end_date?: string | null;
          budget?: number;
          client_id?: Uuid | null;
          manager_id?: Uuid | null;
          team?: Json;
          progress?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          description?: string | null;
          status?: string;
          start_date?: string | null;
          end_date?: string | null;
          budget?: number;
          client_id?: Uuid | null;
          manager_id?: Uuid | null;
          team?: Json;
          progress?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      calendar_events: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          title: string;
          description: string | null;
          type: string;
          start_time: string;
          end_time: string | null;
          all_day: boolean;
          location: string | null;
          attendees: Json;
          reminder_minutes: number;
          recurrence: Json | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          title: string;
          description?: string | null;
          type?: string;
          start_time?: string;
          end_time?: string | null;
          all_day?: boolean;
          location?: string | null;
          attendees?: Json;
          reminder_minutes?: number;
          recurrence?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          title?: string;
          description?: string | null;
          type?: string;
          start_time?: string;
          end_time?: string | null;
          all_day?: boolean;
          location?: string | null;
          attendees?: Json;
          reminder_minutes?: number;
          recurrence?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      transactions: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          type: string;
          category: string;
          amount: number;
          currency: string;
          date: string;
          description: string | null;
          reference_id: Uuid | null;
          reference_type: string | null;
          account: string | null;
          status: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          type: string;
          category?: string;
          amount?: number;
          currency?: string;
          date?: string;
          description?: string | null;
          reference_id?: Uuid | null;
          reference_type?: string | null;
          account?: string | null;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          type?: string;
          category?: string;
          amount?: number;
          currency?: string;
          date?: string;
          description?: string | null;
          reference_id?: Uuid | null;
          reference_type?: string | null;
          account?: string | null;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      companies: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          name: string;
          legal_name: string | null;
          tax_id: string | null;
          email: string | null;
          phone: string | null;
          website: string | null;
          logo_url: string | null;
          address: Json | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          name: string;
          legal_name?: string | null;
          tax_id?: string | null;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          logo_url?: string | null;
          address?: Json | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          name?: string;
          legal_name?: string | null;
          tax_id?: string | null;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          logo_url?: string | null;
          address?: Json | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      accounting_entries: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          date: string;
          description: string | null;
          debit_account: string;
          credit_account: string;
          amount: number;
          currency: string;
          reference_id: Uuid | null;
          reference_type: string | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          date?: string;
          description?: string | null;
          debit_account: string;
          credit_account: string;
          amount?: number;
          currency?: string;
          reference_id?: Uuid | null;
          reference_type?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          date?: string;
          description?: string | null;
          debit_account?: string;
          credit_account?: string;
          amount?: number;
          currency?: string;
          reference_id?: Uuid | null;
          reference_type?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ===== Phase 10: Integration Hub & Marketplace (0015) =====

      integrations: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          app_id: Uuid | null;
          connector_key: string;
          name: string;
          status:
            | "connected"
            | "disconnected"
            | "error"
            | "paused"
            | "expired"
            | "revoked";
          auth_type: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          config: Json;
          capabilities: Json;
          last_synced_at: string | null;
          last_error: string | null;
          error_count: number;
          installed_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          app_id?: Uuid | null;
          connector_key: string;
          name: string;
          status?:
            | "connected"
            | "disconnected"
            | "error"
            | "paused"
            | "expired"
            | "revoked";
          auth_type?: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          config?: Json;
          capabilities?: Json;
          last_synced_at?: string | null;
          last_error?: string | null;
          error_count?: number;
          installed_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          app_id?: Uuid | null;
          connector_key?: string;
          name?: string;
          status?:
            | "connected"
            | "disconnected"
            | "error"
            | "paused"
            | "expired"
            | "revoked";
          auth_type?: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          config?: Json;
          capabilities?: Json;
          last_synced_at?: string | null;
          last_error?: string | null;
          error_count?: number;
          installed_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      integration_credentials: {
        Row: {
          id: Uuid;
          integration_id: Uuid;
          workspace_id: Uuid;
          type:
            | "oauth_access_token"
            | "oauth_refresh_token"
            | "api_key"
            | "basic_password"
            | "webhook_secret"
            | "client_secret"
            | "bearer_token";
          encrypted_value: string;
          key_version: number;
          expires_at: string | null;
          scopes: Json;
          metadata: Json;
          last_rotated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          integration_id: Uuid;
          workspace_id: Uuid;
          type:
            | "oauth_access_token"
            | "oauth_refresh_token"
            | "api_key"
            | "basic_password"
            | "webhook_secret"
            | "client_secret"
            | "bearer_token";
          encrypted_value: string;
          key_version?: number;
          expires_at?: string | null;
          scopes?: Json;
          metadata?: Json;
          last_rotated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          integration_id?: Uuid;
          workspace_id?: Uuid;
          type?:
            | "oauth_access_token"
            | "oauth_refresh_token"
            | "api_key"
            | "basic_password"
            | "webhook_secret"
            | "client_secret"
            | "bearer_token";
          encrypted_value?: string;
          key_version?: number;
          expires_at?: string | null;
          scopes?: Json;
          metadata?: Json;
          last_rotated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      integration_logs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid | null;
          level: "debug" | "info" | "warn" | "error" | "fatal";
          event: string;
          message: string;
          details: Json;
          request_id: string | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id?: Uuid | null;
          level?: "debug" | "info" | "warn" | "error" | "fatal";
          event: string;
          message: string;
          details?: Json;
          request_id?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid | null;
          level?: "debug" | "info" | "warn" | "error" | "fatal";
          event?: string;
          message?: string;
          details?: Json;
          request_id?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      integration_events: {
        Row: {
          id: Uuid;
          workspace_id: Uuid | null;
          source: string;
          type: string;
          category:
            | "internal"
            | "external"
            | "workflow"
            | "ai_employee"
            | "notification"
            | "billing"
            | "crm"
            | "erp"
            | "integration";
          payload: Json;
          metadata: Json;
          delivered_to: Json;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          source: string;
          type: string;
          category?:
            | "internal"
            | "external"
            | "workflow"
            | "ai_employee"
            | "notification"
            | "billing"
            | "crm"
            | "erp"
            | "integration";
          payload?: Json;
          metadata?: Json;
          delivered_to?: Json;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid | null;
          source?: string;
          type?: string;
          category?:
            | "internal"
            | "external"
            | "workflow"
            | "ai_employee"
            | "notification"
            | "billing"
            | "crm"
            | "erp"
            | "integration";
          payload?: Json;
          metadata?: Json;
          delivered_to?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      integration_sync_jobs: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          job_type:
            | "full"
            | "incremental"
            | "webhook_triggered"
            | "manual"
            | "scheduled";
          status:
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled"
            | "retrying";
          resource: string | null;
          direction: "pull" | "push" | "bidirectional";
          trigger: "manual" | "scheduled" | "webhook" | "event";
          records_total: number;
          records_synced: number;
          conflicts_count: number;
          retry_count: number;
          max_retries: number;
          error: string | null;
          details: Json;
          started_at: string | null;
          completed_at: string | null;
          next_retry_at: string | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          job_type?:
            | "full"
            | "incremental"
            | "webhook_triggered"
            | "manual"
            | "scheduled";
          status?:
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled"
            | "retrying";
          resource?: string | null;
          direction?: "pull" | "push" | "bidirectional";
          trigger?: "manual" | "scheduled" | "webhook" | "event";
          records_total?: number;
          records_synced?: number;
          conflicts_count?: number;
          retry_count?: number;
          max_retries?: number;
          error?: string | null;
          details?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          next_retry_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid;
          job_type?:
            | "full"
            | "incremental"
            | "webhook_triggered"
            | "manual"
            | "scheduled";
          status?:
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled"
            | "retrying";
          resource?: string | null;
          direction?: "pull" | "push" | "bidirectional";
          trigger?: "manual" | "scheduled" | "webhook" | "event";
          records_total?: number;
          records_synced?: number;
          conflicts_count?: number;
          retry_count?: number;
          max_retries?: number;
          error?: string | null;
          details?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          next_retry_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      marketplace_apps: {
        Row: {
          id: Uuid;
          slug: string;
          name: string;
          short_name: string | null;
          tagline: string | null;
          description: string | null;
          category:
            | "ai_provider"
            | "communication"
            | "email"
            | "storage"
            | "development"
            | "payments"
            | "commerce"
            | "automation"
            | "crm"
            | "productivity"
            | "analytics"
            | "social"
            | "other";
          subcategory: string | null;
          publisher_id: Uuid | null;
          publisher_name: string | null;
          publisher_verified: boolean;
          connector_key: string | null;
          icon_url: string | null;
          screenshots: Json;
          capabilities: Json;
          auth_type: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          required_scopes: Json;
          config_schema: Json;
          install_instructions: string | null;
          privacy_url: string | null;
          terms_url: string | null;
          documentation_url: string | null;
          is_published: boolean;
          is_featured: boolean;
          is_official: boolean;
          install_count: number;
          rating_avg: number;
          rating_count: number;
          version: string;
          latest_version_id: Uuid | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          name: string;
          short_name?: string | null;
          tagline?: string | null;
          description?: string | null;
          category?:
            | "ai_provider"
            | "communication"
            | "email"
            | "storage"
            | "development"
            | "payments"
            | "commerce"
            | "automation"
            | "crm"
            | "productivity"
            | "analytics"
            | "social"
            | "other";
          subcategory?: string | null;
          publisher_id?: Uuid | null;
          publisher_name?: string | null;
          publisher_verified?: boolean;
          connector_key?: string | null;
          icon_url?: string | null;
          screenshots?: Json;
          capabilities?: Json;
          auth_type?: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          required_scopes?: Json;
          config_schema?: Json;
          install_instructions?: string | null;
          privacy_url?: string | null;
          terms_url?: string | null;
          documentation_url?: string | null;
          is_published?: boolean;
          is_featured?: boolean;
          is_official?: boolean;
          install_count?: number;
          rating_avg?: number;
          rating_count?: number;
          version?: string;
          latest_version_id?: Uuid | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          name?: string;
          short_name?: string | null;
          tagline?: string | null;
          description?: string | null;
          category?:
            | "ai_provider"
            | "communication"
            | "email"
            | "storage"
            | "development"
            | "payments"
            | "commerce"
            | "automation"
            | "crm"
            | "productivity"
            | "analytics"
            | "social"
            | "other";
          subcategory?: string | null;
          publisher_id?: Uuid | null;
          publisher_name?: string | null;
          publisher_verified?: boolean;
          connector_key?: string | null;
          icon_url?: string | null;
          screenshots?: Json;
          capabilities?: Json;
          auth_type?: "oauth2" | "api_key" | "basic" | "webhook" | "none";
          required_scopes?: Json;
          config_schema?: Json;
          install_instructions?: string | null;
          privacy_url?: string | null;
          terms_url?: string | null;
          documentation_url?: string | null;
          is_published?: boolean;
          is_featured?: boolean;
          is_official?: boolean;
          install_count?: number;
          rating_avg?: number;
          rating_count?: number;
          version?: string;
          latest_version_id?: Uuid | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      installed_apps: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          app_id: Uuid;
          integration_id: Uuid | null;
          status: "installed" | "uninstalled" | "suspended" | "update_available";
          installed_version: string | null;
          config: Json;
          permissions_granted: Json;
          installed_by: Uuid | null;
          installed_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          app_id: Uuid;
          integration_id?: Uuid | null;
          status?: "installed" | "uninstalled" | "suspended" | "update_available";
          installed_version?: string | null;
          config?: Json;
          permissions_granted?: Json;
          installed_by?: Uuid | null;
          installed_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          app_id?: Uuid;
          integration_id?: Uuid | null;
          status?: "installed" | "uninstalled" | "suspended" | "update_available";
          installed_version?: string | null;
          config?: Json;
          permissions_granted?: Json;
          installed_by?: Uuid | null;
          installed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      app_reviews: {
        Row: {
          id: Uuid;
          app_id: Uuid;
          workspace_id: Uuid | null;
          user_id: Uuid;
          author_name: string | null;
          title: string | null;
          body: string | null;
          is_verified_install: boolean;
          helpful_count: number;
          is_reported: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          app_id: Uuid;
          workspace_id?: Uuid | null;
          user_id: Uuid;
          author_name?: string | null;
          title?: string | null;
          body?: string | null;
          is_verified_install?: boolean;
          helpful_count?: number;
          is_reported?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          app_id?: Uuid;
          workspace_id?: Uuid | null;
          user_id?: Uuid;
          author_name?: string | null;
          title?: string | null;
          body?: string | null;
          is_verified_install?: boolean;
          helpful_count?: number;
          is_reported?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      app_ratings: {
        Row: {
          id: Uuid;
          app_id: Uuid;
          user_id: Uuid;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          app_id: Uuid;
          user_id: Uuid;
          rating: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          app_id?: Uuid;
          user_id?: Uuid;
          rating?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      webhook_subscriptions: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid | null;
          url_slug: string;
          signing_secret: string;
          events: Json;
          target_url: string | null;
          is_active: boolean;
          secret_version: number;
          last_received_at: string | null;
          total_received: number;
          total_failed: number;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id?: Uuid | null;
          url_slug: string;
          signing_secret: string;
          events?: Json;
          target_url?: string | null;
          is_active?: boolean;
          secret_version?: number;
          last_received_at?: string | null;
          total_received?: number;
          total_failed?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid | null;
          url_slug?: string;
          signing_secret?: string;
          events?: Json;
          target_url?: string | null;
          is_active?: boolean;
          secret_version?: number;
          last_received_at?: string | null;
          total_received?: number;
          total_failed?: number;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      webhook_deliveries: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid | null;
          subscription_id: Uuid | null;
          event_type: string;
          payload: Json;
          target_url: string | null;
          http_method: string;
          status: "pending" | "delivered" | "failed" | "retrying";
          http_status: number | null;
          response_body: string | null;
          attempt_count: number;
          max_attempts: number;
          next_retry_at: string | null;
          duration_ms: number | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id?: Uuid | null;
          subscription_id?: Uuid | null;
          event_type: string;
          payload?: Json;
          target_url?: string | null;
          http_method?: string;
          status?: "pending" | "delivered" | "failed" | "retrying";
          http_status?: number | null;
          response_body?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid | null;
          subscription_id?: Uuid | null;
          event_type?: string;
          payload?: Json;
          target_url?: string | null;
          http_method?: string;
          status?: "pending" | "delivered" | "failed" | "retrying";
          http_status?: number | null;
          response_body?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          duration_ms?: number | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      integration_health: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          status: "healthy" | "degraded" | "down" | "unknown";
          latency_ms: number | null;
          error_rate: number;
          success_count: number;
          failure_count: number;
          last_check_at: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          status?: "healthy" | "degraded" | "down" | "unknown";
          latency_ms?: number | null;
          error_rate?: number;
          success_count?: number;
          failure_count?: number;
          last_check_at?: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid;
          status?: "healthy" | "degraded" | "down" | "unknown";
          latency_ms?: number | null;
          error_rate?: number;
          success_count?: number;
          failure_count?: number;
          last_check_at?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      integration_permissions: {
        Row: {
          id: Uuid;
          integration_id: Uuid;
          workspace_id: Uuid;
          scope: string;
          granted_by: Uuid | null;
          granted_at: string;
          revoked_at: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: Uuid;
          integration_id: Uuid;
          workspace_id: Uuid;
          scope: string;
          granted_by?: Uuid | null;
          granted_at?: string;
          revoked_at?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: Uuid;
          integration_id?: Uuid;
          workspace_id?: Uuid;
          scope?: string;
          granted_by?: Uuid | null;
          granted_at?: string;
          revoked_at?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };

      integration_versions: {
        Row: {
          id: Uuid;
          app_id: Uuid;
          version: string;
          changelog: string | null;
          is_latest: boolean;
          is_breaking: boolean;
          migration_script: string | null;
          published_at: string | null;
          created_by: Uuid | null;
          created_at: string;
        };
        Insert: {
          id?: Uuid;
          app_id: Uuid;
          version: string;
          changelog?: string | null;
          is_latest?: boolean;
          is_breaking?: boolean;
          migration_script?: string | null;
          published_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
        };
        Update: {
          id?: Uuid;
          app_id?: Uuid;
          version?: string;
          changelog?: string | null;
          is_latest?: boolean;
          is_breaking?: boolean;
          migration_script?: string | null;
          published_at?: string | null;
          created_by?: Uuid | null;
          created_at?: string;
        };
        Relationships: [];
      };

      integration_analytics: {
        Row: {
          id: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          metric_date: string;
          api_calls: number;
          api_errors: number;
          avg_latency_ms: number | null;
          p99_latency_ms: number | null;
          sync_runs: number;
          records_synced: number;
          webhooks_received: number;
          webhooks_delivered: number;
          rate_limit_hits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          workspace_id: Uuid;
          integration_id: Uuid;
          metric_date?: string;
          api_calls?: number;
          api_errors?: number;
          avg_latency_ms?: number | null;
          p99_latency_ms?: number | null;
          sync_runs?: number;
          records_synced?: number;
          webhooks_received?: number;
          webhooks_delivered?: number;
          rate_limit_hits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          workspace_id?: Uuid;
          integration_id?: Uuid;
          metric_date?: string;
          api_calls?: number;
          api_errors?: number;
          avg_latency_ms?: number | null;
          p99_latency_ms?: number | null;
          sync_runs?: number;
          records_synced?: number;
          webhooks_received?: number;
          webhooks_delivered?: number;
          rate_limit_hits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ---------------------------------------------------------------------
      // Phase 11 — Marketing Platform
      // ---------------------------------------------------------------------
      newsletter_subscribers: {
        Row: {
          id: Uuid;
          email: string;
          name: string | null;
          status: "subscribed" | "unsubscribed" | "bounced" | "pending";
          source: string | null;
          metadata: Json | null;
          subscribed_at: string;
          unsubscribed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          email: string;
          name?: string | null;
          status?: "subscribed" | "unsubscribed" | "bounced" | "pending";
          source?: string | null;
          metadata?: Json | null;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          email?: string;
          name?: string | null;
          status?: "subscribed" | "unsubscribed" | "bounced" | "pending";
          source?: string | null;
          metadata?: Json | null;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      referrals: {
        Row: {
          id: Uuid;
          referrer_email: string;
          referrer_user_id: Uuid | null;
          referred_email: string | null;
          referred_user_id: Uuid | null;
          referral_code: string;
          status:
            | "pending"
            | "signed_up"
            | "converted"
            | "rewarded"
            | "expired";
          reward_type: string | null;
          reward_amount: number | null;
          metadata: Json | null;
          converted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          referrer_email: string;
          referrer_user_id?: Uuid | null;
          referred_email?: string | null;
          referred_user_id?: Uuid | null;
          referral_code: string;
          status?:
            | "pending"
            | "signed_up"
            | "converted"
            | "rewarded"
            | "expired";
          reward_type?: string | null;
          reward_amount?: number | null;
          metadata?: Json | null;
          converted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          referrer_email?: string;
          referrer_user_id?: Uuid | null;
          referred_email?: string | null;
          referred_user_id?: Uuid | null;
          referral_code?: string;
          status?:
            | "pending"
            | "signed_up"
            | "converted"
            | "rewarded"
            | "expired";
          reward_type?: string | null;
          reward_amount?: number | null;
          metadata?: Json | null;
          converted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      demo_requests: {
        Row: {
          id: Uuid;
          name: string;
          email: string;
          company: string | null;
          phone: string | null;
          team_size: string | null;
          use_case: string | null;
          message: string | null;
          status:
            | "new"
            | "contacted"
            | "qualified"
            | "demo_scheduled"
            | "closed_won"
            | "closed_lost";
          crm_contact_id: string | null;
          metadata: Json | null;
          requested_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name: string;
          email: string;
          company?: string | null;
          phone?: string | null;
          team_size?: string | null;
          use_case?: string | null;
          message?: string | null;
          status?:
            | "new"
            | "contacted"
            | "qualified"
            | "demo_scheduled"
            | "closed_won"
            | "closed_lost";
          crm_contact_id?: string | null;
          metadata?: Json | null;
          requested_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string;
          email?: string;
          company?: string | null;
          phone?: string | null;
          team_size?: string | null;
          use_case?: string | null;
          message?: string | null;
          status?:
            | "new"
            | "contacted"
            | "qualified"
            | "demo_scheduled"
            | "closed_won"
            | "closed_lost";
          crm_contact_id?: string | null;
          metadata?: Json | null;
          requested_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      contact_messages: {
        Row: {
          id: Uuid;
          name: string;
          email: string;
          subject: string | null;
          message: string;
          category:
            | "general"
            | "sales"
            | "support"
            | "partnership"
            | "press"
            | "security"
            | "other";
          status: "new" | "read" | "replied" | "archived" | "spam";
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          name: string;
          email: string;
          subject?: string | null;
          message: string;
          category?:
            | "general"
            | "sales"
            | "support"
            | "partnership"
            | "press"
            | "security"
            | "other";
          status?: "new" | "read" | "replied" | "archived" | "spam";
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          name?: string;
          email?: string;
          subject?: string | null;
          message?: string;
          category?:
            | "general"
            | "sales"
            | "support"
            | "partnership"
            | "press"
            | "security"
            | "other";
          status?: "new" | "read" | "replied" | "archived" | "spam";
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      blog_categories: {
        Row: {
          id: Uuid;
          slug: string;
          name: string;
          description: string | null;
          color: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          name: string;
          description?: string | null;
          color?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          name?: string;
          description?: string | null;
          color?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      blog_tags: {
        Row: {
          id: Uuid;
          slug: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      blog_posts: {
        Row: {
          id: Uuid;
          slug: string;
          title: string;
          excerpt: string | null;
          content: string;
          cover_image_url: string | null;
          category_id: Uuid | null;
          author_name: string | null;
          author_email: string | null;
          author_avatar_url: string | null;
          status: "draft" | "published" | "archived";
          is_featured: boolean;
          reading_time_min: number | null;
          views_count: number;
          likes_count: number;
          published_at: string | null;
          seo_title: string | null;
          seo_description: string | null;
          seo_keywords: string[] | null;
          metadata: Json | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          title: string;
          excerpt?: string | null;
          content: string;
          cover_image_url?: string | null;
          category_id?: Uuid | null;
          author_name?: string | null;
          author_email?: string | null;
          author_avatar_url?: string | null;
          status?: "draft" | "published" | "archived";
          is_featured?: boolean;
          reading_time_min?: number | null;
          views_count?: number;
          likes_count?: number;
          published_at?: string | null;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          title?: string;
          excerpt?: string | null;
          content?: string;
          cover_image_url?: string | null;
          category_id?: Uuid | null;
          author_name?: string | null;
          author_email?: string | null;
          author_avatar_url?: string | null;
          status?: "draft" | "published" | "archived";
          is_featured?: boolean;
          reading_time_min?: number | null;
          views_count?: number;
          likes_count?: number;
          published_at?: string | null;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "blog_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blog_posts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      blog_post_tags: {
        Row: {
          post_id: Uuid;
          tag_id: Uuid;
        };
        Insert: {
          post_id: Uuid;
          tag_id: Uuid;
        };
        Update: {
          post_id?: Uuid;
          tag_id?: Uuid;
        };
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "blog_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "blog_tags";
            referencedColumns: ["id"];
          },
        ];
      };

      documentation_pages: {
        Row: {
          id: Uuid;
          slug: string;
          title: string;
          description: string | null;
          content: string;
          category: string;
          section: string | null;
          sort_order: number;
          is_published: boolean;
          version: string;
          views_count: number;
          seo_title: string | null;
          seo_description: string | null;
          metadata: Json | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          title: string;
          description?: string | null;
          content: string;
          category?: string;
          section?: string | null;
          sort_order?: number;
          is_published?: boolean;
          version?: string;
          views_count?: number;
          seo_title?: string | null;
          seo_description?: string | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          title?: string;
          description?: string | null;
          content?: string;
          category?: string;
          section?: string | null;
          sort_order?: number;
          is_published?: boolean;
          version?: string;
          views_count?: number;
          seo_title?: string | null;
          seo_description?: string | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documentation_pages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      changelog_entries: {
        Row: {
          id: Uuid;
          slug: string;
          title: string;
          version: string | null;
          summary: string | null;
          content: string;
          category:
            | "release"
            | "feature"
            | "improvement"
            | "bugfix"
            | "security"
            | "deprecation";
          is_published: boolean;
          is_featured: boolean;
          published_at: string;
          seo_title: string | null;
          seo_description: string | null;
          metadata: Json | null;
          created_by: Uuid | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: Uuid;
          slug: string;
          title: string;
          version?: string | null;
          summary?: string | null;
          content: string;
          category?:
            | "release"
            | "feature"
            | "improvement"
            | "bugfix"
            | "security"
            | "deprecation";
          is_published?: boolean;
          is_featured?: boolean;
          published_at?: string;
          seo_title?: string | null;
          seo_description?: string | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: Uuid;
          slug?: string;
          title?: string;
          version?: string | null;
          summary?: string | null;
          content?: string;
          category?:
            | "release"
            | "feature"
            | "improvement"
            | "bugfix"
            | "security"
            | "deprecation";
          is_published?: boolean;
          is_featured?: boolean;
          published_at?: string;
          seo_title?: string | null;
          seo_description?: string | null;
          metadata?: Json | null;
          created_by?: Uuid | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "changelog_entries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // ─────────────────────────────────────────────────────────────────────
      // Phase 12 — Supa OS Runtime (10 tables)
      // ─────────────────────────────────────────────────────────────────────
      runtime_sessions: {
        Row: { id: string; workspace_id: string; status: string; session_type: string; config: Json; started_by: string; started_at: string; stopped_at: string | null; pid: string | null; host: string | null; metadata: Json; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; status?: string; session_type?: string; config?: Json; started_by: string; started_at?: string; stopped_at?: string | null; pid?: string | null; host?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; status?: string; session_type?: string; config?: Json; started_by?: string; started_at?: string; stopped_at?: string | null; pid?: string | null; host?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_processes: {
        Row: { id: string; session_id: string; workspace_id: string; process_type: string; process_ref_id: string | null; process_ref_type: string | null; name: string; status: string; priority: number; parent_process_id: string | null; assigned_to: string | null; started_at: string | null; completed_at: string | null; error: string | null; result: Json; tokens_used: number; credits_used: number; duration_ms: number | null; metadata: Json; created_at: string; updated_at: string; };
        Insert: { id?: string; session_id: string; workspace_id: string; process_type: string; process_ref_id?: string | null; process_ref_type?: string | null; name: string; status?: string; priority?: number; parent_process_id?: string | null; assigned_to?: string | null; started_at?: string | null; completed_at?: string | null; error?: string | null; result?: Json; tokens_used?: number; credits_used?: number; duration_ms?: number | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Update: { id?: string; session_id?: string; workspace_id?: string; process_type?: string; process_ref_id?: string | null; process_ref_type?: string | null; name?: string; status?: string; priority?: number; parent_process_id?: string | null; assigned_to?: string | null; started_at?: string | null; completed_at?: string | null; error?: string | null; result?: Json; tokens_used?: number; credits_used?: number; duration_ms?: number | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_tasks: {
        Row: { id: string; session_id: string | null; workspace_id: string; process_id: string | null; task_type: string; name: string; description: string | null; status: string; priority: number; payload: Json; result: Json; error: string | null; retry_count: number; max_retries: number; timeout_ms: number; started_at: string | null; completed_at: string | null; next_retry_at: string | null; scheduled_for: string | null; assigned_agent_id: string | null; tokens_used: number; credits_used: number; metadata: Json; created_by: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; session_id?: string | null; workspace_id: string; process_id?: string | null; task_type: string; name: string; description?: string | null; status?: string; priority?: number; payload?: Json; result?: Json; error?: string | null; retry_count?: number; max_retries?: number; timeout_ms?: number; started_at?: string | null; completed_at?: string | null; next_retry_at?: string | null; scheduled_for?: string | null; assigned_agent_id?: string | null; tokens_used?: number; credits_used?: number; metadata?: Json; created_by?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; session_id?: string | null; workspace_id?: string; process_id?: string | null; task_type?: string; name?: string; description?: string | null; status?: string; priority?: number; payload?: Json; result?: Json; error?: string | null; retry_count?: number; max_retries?: number; timeout_ms?: number; started_at?: string | null; completed_at?: string | null; next_retry_at?: string | null; scheduled_for?: string | null; assigned_agent_id?: string | null; tokens_used?: number; credits_used?: number; metadata?: Json; created_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_events: {
        Row: { id: string; workspace_id: string; session_id: string | null; process_id: string | null; task_id: string | null; event_type: string; category: string; level: string; message: string; payload: Json; source: string | null; metadata: Json; created_at: string; };
        Insert: { id?: string; workspace_id: string; session_id?: string | null; process_id?: string | null; task_id?: string | null; event_type: string; category: string; level?: string; message: string; payload?: Json; source?: string | null; metadata?: Json; created_at?: string; };
        Update: { id?: string; workspace_id?: string; session_id?: string | null; process_id?: string | null; task_id?: string | null; event_type?: string; category?: string; level?: string; message?: string; payload?: Json; source?: string | null; metadata?: Json; created_at?: string; };
        Relationships: [];
      };
      runtime_contexts: {
        Row: { id: string; workspace_id: string; session_id: string | null; context_type: string; context_key: string; parent_context_id: string | null; data: Json; variables: Json; is_shared: boolean; expires_at: string | null; version: number; created_by: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; session_id?: string | null; context_type: string; context_key: string; parent_context_id?: string | null; data?: Json; variables?: Json; is_shared?: boolean; expires_at?: string | null; version?: number; created_by?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; session_id?: string | null; context_type?: string; context_key?: string; parent_context_id?: string | null; data?: Json; variables?: Json; is_shared?: boolean; expires_at?: string | null; version?: number; created_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_metrics: {
        Row: { id: string; workspace_id: string; session_id: string | null; metric_date: string; total_tasks: number; completed_tasks: number; failed_tasks: number; active_processes: number; peak_concurrent: number; total_tokens: number; total_credits: number; avg_task_duration_ms: number; p99_task_duration_ms: number; total_api_calls: number; provider_errors: number; queue_depth_avg: number; metadata: Json; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; session_id?: string | null; metric_date: string; total_tasks?: number; completed_tasks?: number; failed_tasks?: number; active_processes?: number; peak_concurrent?: number; total_tokens?: number; total_credits?: number; avg_task_duration_ms?: number; p99_task_duration_ms?: number; total_api_calls?: number; provider_errors?: number; queue_depth_avg?: number; metadata?: Json; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; session_id?: string | null; metric_date?: string; total_tasks?: number; completed_tasks?: number; failed_tasks?: number; active_processes?: number; peak_concurrent?: number; total_tokens?: number; total_credits?: number; avg_task_duration_ms?: number; p99_task_duration_ms?: number; total_api_calls?: number; provider_errors?: number; queue_depth_avg?: number; metadata?: Json; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_logs: {
        Row: { id: string; workspace_id: string; session_id: string | null; process_id: string | null; task_id: string | null; level: string; source: string; message: string; details: Json; request_id: string | null; duration_ms: number | null; created_at: string; };
        Insert: { id?: string; workspace_id: string; session_id?: string | null; process_id?: string | null; task_id?: string | null; level: string; source: string; message: string; details?: Json; request_id?: string | null; duration_ms?: number | null; created_at?: string; };
        Update: { id?: string; workspace_id?: string; session_id?: string | null; process_id?: string | null; task_id?: string | null; level?: string; source?: string; message?: string; details?: Json; request_id?: string | null; duration_ms?: number | null; created_at?: string; };
        Relationships: [];
      };
      runtime_resources: {
        Row: { id: string; workspace_id: string; resource_type: string; resource_key: string; limit_value: number; used_value: number; reserved_value: number; unit: string; reset_at: string | null; metadata: Json; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; resource_type: string; resource_key: string; limit_value?: number; used_value?: number; reserved_value?: number; unit?: string; reset_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; resource_type?: string; resource_key?: string; limit_value?: number; used_value?: number; reserved_value?: number; unit?: string; reset_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_schedules: {
        Row: { id: string; workspace_id: string; name: string; description: string | null; schedule_type: string; cron_expression: string | null; delay_ms: number | null; scheduled_for: string | null; event_trigger: string | null; target_type: string; target_id: string; target_config: Json; status: string; last_run_at: string | null; next_run_at: string | null; run_count: number; max_runs: number | null; created_by: string; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; name: string; description?: string | null; schedule_type: string; cron_expression?: string | null; delay_ms?: number | null; scheduled_for?: string | null; event_trigger?: string | null; target_type: string; target_id: string; target_config?: Json; status?: string; last_run_at?: string | null; next_run_at?: string | null; run_count?: number; max_runs?: number | null; created_by: string; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; name?: string; description?: string | null; schedule_type?: string; cron_expression?: string | null; delay_ms?: number | null; scheduled_for?: string | null; event_trigger?: string | null; target_type?: string; target_id?: string; target_config?: Json; status?: string; last_run_at?: string | null; next_run_at?: string | null; run_count?: number; max_runs?: number | null; created_by?: string; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      runtime_recovery: {
        Row: { id: string; workspace_id: string; session_id: string | null; recovery_type: string; status: string; checkpoint_data: Json; failed_processes: Json; recovered_processes: Json; error: string | null; started_at: string | null; completed_at: string | null; metadata: Json; created_at: string; updated_at: string; };
        Insert: { id?: string; workspace_id: string; session_id?: string | null; recovery_type: string; status?: string; checkpoint_data?: Json; failed_processes?: Json; recovered_processes?: Json; error?: string | null; started_at?: string | null; completed_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Update: { id?: string; workspace_id?: string; session_id?: string | null; recovery_type?: string; status?: string; checkpoint_data?: Json; failed_processes?: Json; recovered_processes?: Json; error?: string | null; started_at?: string | null; completed_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      is_workspace_member: {
        Args: { ws_id: Uuid; user_id: Uuid };
        Returns: boolean;
      };
      increment_install_count: {
        Args: { app_id: Uuid };
        Returns: number;
      };
      increment_integration_errors: {
        Args: { int_id: Uuid };
        Returns: number;
      };
      increment_webhook_failures: {
        Args: { sub_id: Uuid };
        Returns: number;
      };
      increment_webhook_received: {
        Args: { sub_id: Uuid };
        Returns: number;
      };
      recalc_app_rating: {
        Args: { target_app_id: Uuid };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
  };
}

/** Convenience alias for a public-table row shape. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Convenience alias for a public-table insert shape. */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Convenience alias for a public-table update shape. */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
