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
      assign_assembly_staff: {
        Args: { p_assembly: string; p_role: Database["public"]["Enums"]["staff_role"]; p_user: string };
        Returns: undefined;
      };
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
      delete_member: { Args: { p_member: string }; Returns: undefined };
      delete_weight_key: { Args: { p_key: string }; Returns: undefined };
      get_org_invitation: { Args: { p_token: string }; Returns: Json };
      import_members: {
        Args: { p_assembly: string; p_dry_run: boolean; p_mode: string; p_rows: Json; p_source?: Json };
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
      remove_assembly_staff: {
        Args: { p_assembly: string; p_role: Database["public"]["Enums"]["staff_role"]; p_user: string };
        Returns: undefined;
      };
      remove_org_member: { Args: { p_org: string; p_user: string }; Returns: undefined };
      revoke_org_invitation: { Args: { p_invitation: string }; Returns: undefined };
      set_assembly_status: {
        Args: { p_assembly: string; p_reason?: string; p_to: Database["public"]["Enums"]["assembly_status"] };
        Returns: number;
      };
      set_org_member_role: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["org_role"]; p_user: string };
        Returns: undefined;
      };
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
      upsert_member: {
        Args: { p_assembly: string; p_expected_version?: number; p_member: string; p_row: Json };
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
