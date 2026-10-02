export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      assemblies: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_rehearsal: boolean;
          legal_family: string;
          legal_form: string | null;
          location: string | null;
          mode: Database["public"]["Enums"]["assembly_mode"];
          org_id: string;
          president_attendee_id: string | null;
          proxy_rules: NonNullable<Json>;
          quorum_rule: Json | null;
          settings: NonNullable<Json>;
          starts_at: string;
          status: Database["public"]["Enums"]["assembly_status"];
          timezone: string;
          title: string;
          type: Database["public"]["Enums"]["assembly_type"];
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          is_rehearsal?: boolean;
          legal_family: string;
          legal_form?: string | null;
          location?: string | null;
          mode?: Database["public"]["Enums"]["assembly_mode"];
          org_id: string;
          president_attendee_id?: string | null;
          proxy_rules: NonNullable<Json>;
          quorum_rule?: Json | null;
          settings?: NonNullable<Json>;
          starts_at: string;
          status?: Database["public"]["Enums"]["assembly_status"];
          timezone?: string;
          title: string;
          type: Database["public"]["Enums"]["assembly_type"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_rehearsal?: boolean;
          legal_family?: string;
          legal_form?: string | null;
          location?: string | null;
          mode?: Database["public"]["Enums"]["assembly_mode"];
          org_id?: string;
          president_attendee_id?: string | null;
          proxy_rules?: NonNullable<Json>;
          quorum_rule?: Json | null;
          settings?: NonNullable<Json>;
          starts_at?: string;
          status?: Database["public"]["Enums"]["assembly_status"];
          timezone?: string;
          title?: string;
          type?: Database["public"]["Enums"]["assembly_type"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assemblies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assemblies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assemblies_president_fk";
            columns: ["president_attendee_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
        ];
      };
      assembly_staff: {
        Row: {
          assembly_id: string;
          created_at: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Insert: {
          assembly_id: string;
          created_at?: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Update: {
          assembly_id?: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assembly_staff_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assembly_staff_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_events: {
        Row: {
          assembly_id: string;
          at: string;
          attendee_id: string;
          by_user_id: string | null;
          id: number;
          mode: string | null;
          payload: NonNullable<Json>;
          type: string;
        };
        Insert: {
          assembly_id: string;
          at?: string;
          attendee_id: string;
          by_user_id?: string | null;
          id?: never;
          mode?: string | null;
          payload?: NonNullable<Json>;
          type: string;
        };
        Update: {
          assembly_id?: string;
          at?: string;
          attendee_id?: string;
          by_user_id?: string | null;
          id?: never;
          mode?: string | null;
          payload?: NonNullable<Json>;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_events_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
      attendee_members: {
        Row: {
          assembly_id: string;
          attendee_id: string;
          member_id: string;
        };
        Insert: {
          assembly_id: string;
          attendee_id: string;
          member_id: string;
        };
        Update: {
          assembly_id?: string;
          attendee_id?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendee_members_attendee_id_assembly_id_fkey";
            columns: ["attendee_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "attendee_members_member_id_assembly_id_fkey";
            columns: ["member_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      attendees: {
        Row: {
          assembly_id: string;
          checked_in_at: string | null;
          checked_out_at: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          is_proxy_ineligible: boolean;
          phone: string | null;
          signature_path: string | null;
          status: Database["public"]["Enums"]["attendee_status"];
          version: number;
        };
        Insert: {
          assembly_id: string;
          checked_in_at?: string | null;
          checked_out_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          is_proxy_ineligible?: boolean;
          phone?: string | null;
          signature_path?: string | null;
          status?: Database["public"]["Enums"]["attendee_status"];
          version?: number;
        };
        Update: {
          assembly_id?: string;
          checked_in_at?: string | null;
          checked_out_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_proxy_ineligible?: boolean;
          phone?: string | null;
          signature_path?: string | null;
          status?: Database["public"]["Enums"]["attendee_status"];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "attendees_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_heads: {
        Row: {
          chain_id: string;
          hash: string;
          seq: number;
        };
        Insert: {
          chain_id: string;
          hash: string;
          seq: number;
        };
        Update: {
          chain_id?: string;
          hash?: string;
          seq?: number;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_attendee_id: string | null;
          actor_user_id: string | null;
          assembly_id: string | null;
          at: string;
          chain_id: string;
          hash: string;
          id: number;
          org_id: string;
          payload: NonNullable<Json>;
          prev_hash: string;
          seq: number;
        };
        Insert: {
          action: string;
          actor_attendee_id?: string | null;
          actor_user_id?: string | null;
          assembly_id?: string | null;
          at: string;
          chain_id: string;
          hash: string;
          id?: never;
          org_id: string;
          payload?: NonNullable<Json>;
          prev_hash: string;
          seq: number;
        };
        Update: {
          action?: string;
          actor_attendee_id?: string | null;
          actor_user_id?: string | null;
          assembly_id?: string | null;
          at?: string;
          chain_id?: string;
          hash?: string;
          id?: never;
          org_id?: string;
          payload?: NonNullable<Json>;
          prev_hash?: string;
          seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_assembly_fk";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ballot_eligibility: {
        Row: {
          assembly_id: string;
          auto_choice: string | null;
          ballot_id: string;
          holder_attendee_id: string | null;
          holder_changed_at: string | null;
          member_id: string;
          presence_status: Database["public"]["Enums"]["presence_status"];
          via_proxy_id: string | null;
          weight: number;
        };
        Insert: {
          assembly_id: string;
          auto_choice?: string | null;
          ballot_id: string;
          holder_attendee_id?: string | null;
          holder_changed_at?: string | null;
          member_id: string;
          presence_status: Database["public"]["Enums"]["presence_status"];
          via_proxy_id?: string | null;
          weight: number;
        };
        Update: {
          assembly_id?: string;
          auto_choice?: string | null;
          ballot_id?: string;
          holder_attendee_id?: string | null;
          holder_changed_at?: string | null;
          member_id?: string;
          presence_status?: Database["public"]["Enums"]["presence_status"];
          via_proxy_id?: string | null;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ballot_eligibility_ballot_id_assembly_id_fkey";
            columns: ["ballot_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "ballots";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "ballot_eligibility_holder_attendee_id_assembly_id_fkey";
            columns: ["holder_attendee_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "ballot_eligibility_member_id_assembly_id_fkey";
            columns: ["member_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      ballots: {
        Row: {
          assembly_id: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancelled_reason: string | null;
          closed_at: string | null;
          closed_by: string | null;
          closes_at: string | null;
          id: string;
          opened_at: string;
          opened_by: string | null;
          resolution_id: string;
          round: number;
          rules_snapshot: NonNullable<Json>;
          status: Database["public"]["Enums"]["ballot_status"];
          totals: NonNullable<Json>;
          validated_at: string | null;
          validated_by: string | null;
          votes_digest: string | null;
        };
        Insert: {
          assembly_id: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancelled_reason?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closes_at?: string | null;
          id?: string;
          opened_at?: string;
          opened_by?: string | null;
          resolution_id: string;
          round?: number;
          rules_snapshot: NonNullable<Json>;
          status?: Database["public"]["Enums"]["ballot_status"];
          totals?: NonNullable<Json>;
          validated_at?: string | null;
          validated_by?: string | null;
          votes_digest?: string | null;
        };
        Update: {
          assembly_id?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancelled_reason?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closes_at?: string | null;
          id?: string;
          opened_at?: string;
          opened_by?: string | null;
          resolution_id?: string;
          round?: number;
          rules_snapshot?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["ballot_status"];
          totals?: NonNullable<Json>;
          validated_at?: string | null;
          validated_by?: string | null;
          votes_digest?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ballots_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ballots_resolution_id_assembly_id_fkey";
            columns: ["resolution_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "resolutions";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      member_presence: {
        Row: {
          assembly_id: string;
          holder_attendee_id: string | null;
          member_id: string;
          since: string;
          status: Database["public"]["Enums"]["presence_status"];
          version: number;
          via_proxy_id: string | null;
        };
        Insert: {
          assembly_id: string;
          holder_attendee_id?: string | null;
          member_id: string;
          since?: string;
          status: Database["public"]["Enums"]["presence_status"];
          version?: number;
          via_proxy_id?: string | null;
        };
        Update: {
          assembly_id?: string;
          holder_attendee_id?: string | null;
          member_id?: string;
          since?: string;
          status?: Database["public"]["Enums"]["presence_status"];
          version?: number;
          via_proxy_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "member_presence_holder_attendee_id_assembly_id_fkey";
            columns: ["holder_attendee_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "member_presence_member_id_assembly_id_fkey";
            columns: ["member_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "member_presence_via_proxy_id_fkey";
            columns: ["via_proxy_id"];
            isOneToOne: false;
            referencedRelation: "proxies";
            referencedColumns: ["id"];
          },
        ];
      };
      member_weights: {
        Row: {
          assembly_id: string;
          member_id: string;
          weight: number;
          weight_key_id: string;
        };
        Insert: {
          assembly_id: string;
          member_id: string;
          weight: number;
          weight_key_id: string;
        };
        Update: {
          assembly_id?: string;
          member_id?: string;
          weight?: number;
          weight_key_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_weights_member_id_assembly_id_fkey";
            columns: ["member_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "member_weights_weight_key_id_assembly_id_fkey";
            columns: ["weight_key_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "weight_key_totals";
            referencedColumns: ["weight_key_id", "assembly_id"];
          },
          {
            foreignKeyName: "member_weights_weight_key_id_assembly_id_fkey";
            columns: ["weight_key_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "weight_keys";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      members: {
        Row: {
          assembly_id: string;
          company_name: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          external_ref: string | null;
          first_name: string | null;
          id: string;
          is_proxy_ineligible: boolean;
          kind: Database["public"]["Enums"]["member_kind"];
          last_name: string | null;
          phone: string | null;
          representative_name: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          assembly_id: string;
          company_name?: string | null;
          created_at?: string;
          display_name: string;
          email?: string | null;
          external_ref?: string | null;
          first_name?: string | null;
          id?: string;
          is_proxy_ineligible?: boolean;
          kind: Database["public"]["Enums"]["member_kind"];
          last_name?: string | null;
          phone?: string | null;
          representative_name?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          assembly_id?: string;
          company_name?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          external_ref?: string | null;
          first_name?: string | null;
          id?: string;
          is_proxy_ineligible?: boolean;
          kind?: Database["public"]["Enums"]["member_kind"];
          last_name?: string | null;
          phone?: string | null;
          representative_name?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "members_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          created_by: string;
          email: string;
          expires_at: string;
          id: string;
          org_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by: string;
          email: string;
          expires_at: string;
          id?: string;
          org_id: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          org_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          branding: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          retention_days: number | null;
          slug: string;
        };
        Insert: {
          branding?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          retention_days?: number | null;
          slug: string;
        };
        Update: {
          branding?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          retention_days?: number | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      proxies: {
        Row: {
          assembly_id: string;
          created_at: string;
          created_by: string | null;
          derogation_by: string | null;
          derogation_reason: string | null;
          document_path: string | null;
          grantor_member_id: string;
          holder_attendee_id: string | null;
          id: string;
          parent_proxy_id: string | null;
          return_expected: boolean;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_kind: string | null;
          revoked_reason: string | null;
          status: Database["public"]["Enums"]["proxy_status"];
          type: Database["public"]["Enums"]["proxy_type"];
        };
        Insert: {
          assembly_id: string;
          created_at?: string;
          created_by?: string | null;
          derogation_by?: string | null;
          derogation_reason?: string | null;
          document_path?: string | null;
          grantor_member_id: string;
          holder_attendee_id?: string | null;
          id?: string;
          parent_proxy_id?: string | null;
          return_expected?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_kind?: string | null;
          revoked_reason?: string | null;
          status: Database["public"]["Enums"]["proxy_status"];
          type: Database["public"]["Enums"]["proxy_type"];
        };
        Update: {
          assembly_id?: string;
          created_at?: string;
          created_by?: string | null;
          derogation_by?: string | null;
          derogation_reason?: string | null;
          document_path?: string | null;
          grantor_member_id?: string;
          holder_attendee_id?: string | null;
          id?: string;
          parent_proxy_id?: string | null;
          return_expected?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_kind?: string | null;
          revoked_reason?: string | null;
          status?: Database["public"]["Enums"]["proxy_status"];
          type?: Database["public"]["Enums"]["proxy_type"];
        };
        Relationships: [
          {
            foreignKeyName: "proxies_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proxies_grantor_member_id_assembly_id_fkey";
            columns: ["grantor_member_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "proxies_holder_attendee_id_assembly_id_fkey";
            columns: ["holder_attendee_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "proxies_parent_proxy_id_fkey";
            columns: ["parent_proxy_id"];
            isOneToOne: false;
            referencedRelation: "proxies";
            referencedColumns: ["id"];
          },
        ];
      };
      resolution_attachments: {
        Row: {
          assembly_id: string;
          created_at: string;
          filename: string;
          id: string;
          path: string;
          resolution_id: string;
          size_bytes: number;
          uploaded_by: string | null;
        };
        Insert: {
          assembly_id: string;
          created_at?: string;
          filename: string;
          id?: string;
          path: string;
          resolution_id: string;
          size_bytes: number;
          uploaded_by?: string | null;
        };
        Update: {
          assembly_id?: string;
          created_at?: string;
          filename?: string;
          id?: string;
          path?: string;
          resolution_id?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resolution_attachments_resolution_id_assembly_id_fkey";
            columns: ["resolution_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "resolutions";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      resolution_versions: {
        Row: {
          assembly_id: string;
          assembly_status: Database["public"]["Enums"]["assembly_status"];
          change_kind: string;
          changed_at: string;
          changed_by: string | null;
          id: number;
          reason: string | null;
          resolution_id: string;
          snapshot: NonNullable<Json>;
          version: number;
        };
        Insert: {
          assembly_id: string;
          assembly_status: Database["public"]["Enums"]["assembly_status"];
          change_kind: string;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          reason?: string | null;
          resolution_id: string;
          snapshot: NonNullable<Json>;
          version: number;
        };
        Update: {
          assembly_id?: string;
          assembly_status?: Database["public"]["Enums"]["assembly_status"];
          change_kind?: string;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          reason?: string | null;
          resolution_id?: string;
          snapshot?: NonNullable<Json>;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resolution_versions_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
      resolutions: {
        Row: {
          abstention_policy: string;
          allow_vote_change: boolean | null;
          assembly_id: string;
          board_recommendation: string | null;
          body: NonNullable<Json>;
          body_text: string;
          created_at: string;
          id: string;
          is_secret: boolean;
          majority_rule: Json | null;
          mode: Database["public"]["Enums"]["resolution_mode"];
          number: string;
          parent_id: string | null;
          position: number;
          quorum_rule: Json | null;
          title: string;
          updated_at: string;
          version: number;
          vote_type: Database["public"]["Enums"]["vote_type"];
          weight_key_id: string;
        };
        Insert: {
          abstention_policy?: string;
          allow_vote_change?: boolean | null;
          assembly_id: string;
          board_recommendation?: string | null;
          body?: NonNullable<Json>;
          body_text?: string;
          created_at?: string;
          id?: string;
          is_secret?: boolean;
          majority_rule?: Json | null;
          mode?: Database["public"]["Enums"]["resolution_mode"];
          number?: string;
          parent_id?: string | null;
          position: number;
          quorum_rule?: Json | null;
          title: string;
          updated_at?: string;
          version?: number;
          vote_type?: Database["public"]["Enums"]["vote_type"];
          weight_key_id: string;
        };
        Update: {
          abstention_policy?: string;
          allow_vote_change?: boolean | null;
          assembly_id?: string;
          board_recommendation?: string | null;
          body?: NonNullable<Json>;
          body_text?: string;
          created_at?: string;
          id?: string;
          is_secret?: boolean;
          majority_rule?: Json | null;
          mode?: Database["public"]["Enums"]["resolution_mode"];
          number?: string;
          parent_id?: string | null;
          position?: number;
          quorum_rule?: Json | null;
          title?: string;
          updated_at?: string;
          version?: number;
          vote_type?: Database["public"]["Enums"]["vote_type"];
          weight_key_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resolutions_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resolutions_parent_id_assembly_id_fkey";
            columns: ["parent_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "resolutions";
            referencedColumns: ["id", "assembly_id"];
          },
          {
            foreignKeyName: "resolutions_weight_key_id_assembly_id_fkey";
            columns: ["weight_key_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "weight_key_totals";
            referencedColumns: ["weight_key_id", "assembly_id"];
          },
          {
            foreignKeyName: "resolutions_weight_key_id_assembly_id_fkey";
            columns: ["weight_key_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "weight_keys";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      results: {
        Row: {
          assembly_id: string;
          ballot_id: string;
          computed_at: string;
          evaluation: NonNullable<Json>;
          outcome: Database["public"]["Enums"]["ballot_outcome"];
          tallies: NonNullable<Json>;
        };
        Insert: {
          assembly_id: string;
          ballot_id: string;
          computed_at?: string;
          evaluation: NonNullable<Json>;
          outcome: Database["public"]["Enums"]["ballot_outcome"];
          tallies: NonNullable<Json>;
        };
        Update: {
          assembly_id?: string;
          ballot_id?: string;
          computed_at?: string;
          evaluation?: NonNullable<Json>;
          outcome?: Database["public"]["Enums"]["ballot_outcome"];
          tallies?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "results_ballot_id_assembly_id_fkey";
            columns: ["ballot_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "ballots";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      rule_presets: {
        Row: {
          abstention_policy: string | null;
          assembly_family: string;
          code: string;
          description_fr: string | null;
          kind: string;
          label_fr: string;
          legal_form: string | null;
          legal_reference: string | null;
          params: NonNullable<Json>;
          position: number;
          validated_by_lawyer: boolean;
        };
        Insert: {
          abstention_policy?: string | null;
          assembly_family: string;
          code: string;
          description_fr?: string | null;
          kind: string;
          label_fr: string;
          legal_form?: string | null;
          legal_reference?: string | null;
          params: NonNullable<Json>;
          position?: number;
          validated_by_lawyer?: boolean;
        };
        Update: {
          abstention_policy?: string | null;
          assembly_family?: string;
          code?: string;
          description_fr?: string | null;
          kind?: string;
          label_fr?: string;
          legal_form?: string | null;
          legal_reference?: string | null;
          params?: NonNullable<Json>;
          position?: number;
          validated_by_lawyer?: boolean;
        };
        Relationships: [];
      };
      vote_events: {
        Row: {
          at: string;
          ballot_id: string;
          cast_by_attendee_id: string | null;
          cast_by_user_id: string | null;
          channel: Database["public"]["Enums"]["cast_channel"];
          choice: string;
          id: number;
          idempotency_key: string | null;
          member_id: string;
          revision: number;
          weight: number;
        };
        Insert: {
          at: string;
          ballot_id: string;
          cast_by_attendee_id?: string | null;
          cast_by_user_id?: string | null;
          channel: Database["public"]["Enums"]["cast_channel"];
          choice: string;
          id?: never;
          idempotency_key?: string | null;
          member_id: string;
          revision: number;
          weight: number;
        };
        Update: {
          at?: string;
          ballot_id?: string;
          cast_by_attendee_id?: string | null;
          cast_by_user_id?: string | null;
          channel?: Database["public"]["Enums"]["cast_channel"];
          choice?: string;
          id?: never;
          idempotency_key?: string | null;
          member_id?: string;
          revision?: number;
          weight?: number;
        };
        Relationships: [];
      };
      vote_requests: {
        Row: {
          attendee_id: string;
          ballot_id: string;
          created_at: string;
          idempotency_key: string;
          response: Json | null;
        };
        Insert: {
          attendee_id: string;
          ballot_id: string;
          created_at?: string;
          idempotency_key: string;
          response?: Json | null;
        };
        Update: {
          attendee_id?: string;
          ballot_id?: string;
          created_at?: string;
          idempotency_key?: string;
          response?: Json | null;
        };
        Relationships: [];
      };
      voter_tokens: {
        Row: {
          assembly_id: string;
          attendee_id: string;
          claimed_at: string | null;
          claimed_by: string | null;
          device_label: string | null;
          expires_at: string;
          id: string;
          issued_at: string;
          issued_by: string | null;
          kind: string;
          revoked_at: string | null;
          revoked_reason: string | null;
          token_hash: string;
        };
        Insert: {
          assembly_id: string;
          attendee_id: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          device_label?: string | null;
          expires_at: string;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          kind: string;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          token_hash: string;
        };
        Update: {
          assembly_id?: string;
          attendee_id?: string;
          claimed_at?: string | null;
          claimed_by?: string | null;
          device_label?: string | null;
          expires_at?: string;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          kind?: string;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voter_tokens_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voter_tokens_attendee_id_assembly_id_fkey";
            columns: ["attendee_id", "assembly_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id", "assembly_id"];
          },
        ];
      };
      votes: {
        Row: {
          assembly_id: string;
          ballot_id: string;
          cast_at: string;
          cast_by_attendee_id: string | null;
          cast_by_user_id: string | null;
          channel: Database["public"]["Enums"]["cast_channel"];
          choice: string;
          id: number;
          idempotency_key: string | null;
          member_id: string;
          revision: number;
          weight: number;
        };
        Insert: {
          assembly_id: string;
          ballot_id: string;
          cast_at?: string;
          cast_by_attendee_id?: string | null;
          cast_by_user_id?: string | null;
          channel: Database["public"]["Enums"]["cast_channel"];
          choice: string;
          id?: never;
          idempotency_key?: string | null;
          member_id: string;
          revision?: number;
          weight: number;
        };
        Update: {
          assembly_id?: string;
          ballot_id?: string;
          cast_at?: string;
          cast_by_attendee_id?: string | null;
          cast_by_user_id?: string | null;
          channel?: Database["public"]["Enums"]["cast_channel"];
          choice?: string;
          id?: never;
          idempotency_key?: string | null;
          member_id?: string;
          revision?: number;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "votes_ballot_id_member_id_fkey";
            columns: ["ballot_id", "member_id"];
            isOneToOne: true;
            referencedRelation: "ballot_eligibility";
            referencedColumns: ["ballot_id", "member_id"];
          },
        ];
      };
      weight_keys: {
        Row: {
          assembly_id: string;
          code: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          label: string;
          position: number;
          total_declared: number | null;
        };
        Insert: {
          assembly_id: string;
          code: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          label: string;
          position?: number;
          total_declared?: number | null;
        };
        Update: {
          assembly_id?: string;
          code?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          label?: string;
          position?: number;
          total_declared?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "weight_keys_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      weight_key_totals: {
        Row: {
          assembly_id: string | null;
          code: string | null;
          is_primary: boolean | null;
          label: string | null;
          members_with_weight: number | null;
          position: number | null;
          total_declared: number | null;
          total_imported: number | null;
          weight_key_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "weight_keys_assembly_id_fkey";
            columns: ["assembly_id"];
            isOneToOne: false;
            referencedRelation: "assemblies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_org_invitation: { Args: { p_token: string }; Returns: string };
      add_resolution_attachment: {
        Args: { p_filename: string; p_path: string; p_resolution: string };
        Returns: string;
      };
      assign_assembly_staff: {
        Args: { p_assembly: string; p_role: Database["public"]["Enums"]["staff_role"]; p_user: string };
        Returns: undefined;
      };
      attendee_portfolio: { Args: { p_attendee: string }; Returns: Json };
      ballot_progress: { Args: { p_ballot: string }; Returns: Json };
      bureau_amend_resolution: {
        Args: { p_data: Json; p_expected_version: number; p_reason: string; p_resolution: string };
        Returns: string;
      };
      bureau_set_member_weight: {
        Args: { p_member: string; p_reason: string; p_weight: number; p_weight_key: string };
        Returns: undefined;
      };
      cancel_ballot: { Args: { p_ballot: string; p_reason: string }; Returns: undefined };
      cast_votes: { Args: { p_ballot: string; p_idempotency_key: string; p_items: Json }; Returns: Json };
      check_in: {
        Args: {
          p_assembly: string;
          p_attendee: string;
          p_expected_version?: number;
          p_new_attendee?: Json;
          p_signature_path?: string;
        };
        Returns: Json;
      };
      check_out: {
        Args: {
          p_attendee: string;
          p_derogation_reason?: string;
          p_expected_version?: number;
          p_mode: string;
          p_transfer_to?: string;
        };
        Returns: Json;
      };
      claim_voter_token: { Args: { p_code: string }; Returns: Json };
      close_ballot: { Args: { p_ballot: string }; Returns: Json };
      create_assembly: {
        Args: {
          p_legal_family: string;
          p_legal_form: string;
          p_location?: string;
          p_org: string;
          p_starts_local: string;
          p_timezone?: string;
          p_title: string;
          p_type: Database["public"]["Enums"]["assembly_type"];
        };
        Returns: string;
      };
      create_organization: { Args: { p_name: string; p_slug: string }; Returns: string };
      current_quorum: { Args: { p_assembly: string; p_weight_key?: string }; Returns: Json };
      delete_member: { Args: { p_member: string }; Returns: undefined };
      delete_resolution: { Args: { p_reason?: string; p_resolution: string }; Returns: undefined };
      delete_weight_key: { Args: { p_key: string }; Returns: undefined };
      get_org_invitation: { Args: { p_token: string }; Returns: Json };
      grant_proxy: {
        Args: {
          p_assembly: string;
          p_derogation_reason?: string;
          p_document_path?: string;
          p_grantor: string;
          p_holder: string;
          p_type: Database["public"]["Enums"]["proxy_type"];
        };
        Returns: string;
      };
      grant_proxy_to: {
        Args: {
          p_assembly: string;
          p_derogation_reason?: string;
          p_grantor: string;
          p_holder: Json;
          p_type: Database["public"]["Enums"]["proxy_type"];
        };
        Returns: string;
      };
      import_members: {
        Args: { p_assembly: string; p_dry_run: boolean; p_mode: string; p_rows: Json; p_source?: Json };
        Returns: Json;
      };
      import_proxies: {
        Args: { p_assembly: string; p_dry_run: boolean; p_rows: Json; p_source?: Json };
        Returns: Json;
      };
      invite_org_member: {
        Args: {
          p_email: string;
          p_org: string;
          p_role: Database["public"]["Enums"]["org_role"];
          p_ttl_days?: number;
        };
        Returns: Json;
      };
      issue_voter_token: {
        Args: { p_attendee: string; p_device_label?: string; p_kind: string };
        Returns: Json;
      };
      my_ballots: { Args: Record<PropertyKey, never>; Returns: Json };
      my_voter_context: { Args: Record<PropertyKey, never>; Returns: Json };
      open_ballot: { Args: { p_duration_seconds?: number; p_resolution: string }; Returns: Json };
      proxy_overview: { Args: { p_assembly: string }; Returns: Json };
      reception_snapshot: { Args: { p_assembly: string }; Returns: Json };
      regie_snapshot: { Args: { p_assembly: string }; Returns: Json };
      release_voter_device: { Args: Record<PropertyKey, never>; Returns: undefined };
      remind_voters: { Args: { p_ballot: string }; Returns: number };
      remove_assembly_staff: {
        Args: { p_assembly: string; p_role: Database["public"]["Enums"]["staff_role"]; p_user: string };
        Returns: undefined;
      };
      remove_org_member: { Args: { p_org: string; p_user: string }; Returns: undefined };
      remove_resolution_attachment: { Args: { p_attachment: string }; Returns: string };
      reorder_resolutions: {
        Args: { p_assembly: string; p_ordered_ids: string[]; p_parent: string };
        Returns: undefined;
      };
      return_attendee: { Args: { p_attendee: string; p_expected_version?: number }; Returns: Json };
      revoke_org_invitation: { Args: { p_invitation: string }; Returns: undefined };
      revoke_proxy: { Args: { p_proxy: string; p_reason?: string }; Returns: undefined };
      revoke_voter_token: { Args: { p_attendee: string; p_reason?: string }; Returns: undefined };
      set_assembly_status: {
        Args: { p_assembly: string; p_reason?: string; p_to: Database["public"]["Enums"]["assembly_status"] };
        Returns: number;
      };
      set_ballot_timer: { Args: { p_ballot: string; p_seconds: number }; Returns: string };
      set_org_member_role: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["org_role"]; p_user: string };
        Returns: undefined;
      };
      set_president: { Args: { p_assembly: string; p_attendee: string }; Returns: Json };
      set_proxy_document: { Args: { p_path: string; p_proxy: string }; Returns: undefined };
      update_assembly_info: {
        Args: {
          p_assembly: string;
          p_expected_version: number;
          p_legal_family: string;
          p_legal_form: string;
          p_location: string;
          p_starts_local: string;
          p_timezone: string;
          p_title: string;
          p_type: Database["public"]["Enums"]["assembly_type"];
        };
        Returns: number;
      };
      update_assembly_rules: {
        Args: {
          p_assembly: string;
          p_expected_version: number;
          p_proxy_rules: Json;
          p_quorum_rule: Json;
          p_settings: Json;
        };
        Returns: number;
      };
      upsert_attendee: {
        Args: {
          p_assembly: string;
          p_attendee: string;
          p_email: string;
          p_expected_version?: number;
          p_full_name: string;
          p_is_proxy_ineligible: boolean;
          p_member_ids: string[];
          p_phone: string;
        };
        Returns: string;
      };
      upsert_member: {
        Args: { p_assembly: string; p_expected_version?: number; p_member: string; p_row: Json };
        Returns: string;
      };
      upsert_resolution: {
        Args: {
          p_assembly: string;
          p_data: Json;
          p_expected_version?: number;
          p_reason?: string;
          p_resolution: string;
        };
        Returns: string;
      };
      upsert_weight_key: {
        Args: {
          p_assembly: string;
          p_code: string;
          p_is_primary: boolean;
          p_key: string;
          p_label: string;
          p_total_declared: number;
        };
        Returns: string;
      };
      validate_result: { Args: { p_ballot: string }; Returns: Json };
      verify_audit_chain: { Args: { p_chain_id: string }; Returns: Json };
    };
    Enums: {
      assembly_mode: "in_person" | "remote" | "hybrid";
      assembly_status: "draft" | "convened" | "in_session" | "closed" | "archived";
      assembly_type: "ago" | "age" | "mixed" | "other";
      attendee_status: "expected" | "present" | "left";
      ballot_outcome: "adopted" | "rejected" | "no_quorum" | "information";
      ballot_status: "open" | "closed" | "validated" | "cancelled";
      cast_channel: "device" | "operator" | "show_of_hands" | "correspondence";
      member_kind: "person" | "legal_entity";
      org_role: "org_admin" | "organizer";
      presence_status: "expected" | "present" | "represented" | "correspondence" | "left" | "absent";
      proxy_status: "pending" | "active" | "revoked";
      proxy_type: "named" | "blank" | "temporary";
      resolution_mode: "electronic" | "show_of_hands" | "mixed";
      staff_role: "president" | "secretary" | "scrutineer" | "reception";
      vote_type: "yes_no_abstain" | "multiple_choice" | "election" | "information";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assembly_mode: ["in_person", "remote", "hybrid"],
      assembly_status: ["draft", "convened", "in_session", "closed", "archived"],
      assembly_type: ["ago", "age", "mixed", "other"],
      attendee_status: ["expected", "present", "left"],
      ballot_outcome: ["adopted", "rejected", "no_quorum", "information"],
      ballot_status: ["open", "closed", "validated", "cancelled"],
      cast_channel: ["device", "operator", "show_of_hands", "correspondence"],
      member_kind: ["person", "legal_entity"],
      org_role: ["org_admin", "organizer"],
      presence_status: ["expected", "present", "represented", "correspondence", "left", "absent"],
      proxy_status: ["pending", "active", "revoked"],
      proxy_type: ["named", "blank", "temporary"],
      resolution_mode: ["electronic", "show_of_hands", "mixed"],
      staff_role: ["president", "secretary", "scrutineer", "reception"],
      vote_type: ["yes_no_abstain", "multiple_choice", "election", "information"],
    },
  },
} as const;
