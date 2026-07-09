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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      children: {
        Row: {
          birth_month: string | null
          call_name: string
          created_at: string
          id: string
          monitor_id: string
          sex: Database["public"]["Enums"]["child_sex"] | null
          updated_at: string
        }
        Insert: {
          birth_month?: string | null
          call_name: string
          created_at?: string
          id?: string
          monitor_id: string
          sex?: Database["public"]["Enums"]["child_sex"] | null
          updated_at?: string
        }
        Update: {
          birth_month?: string | null
          call_name?: string
          created_at?: string
          id?: string
          monitor_id?: string
          sex?: Database["public"]["Enums"]["child_sex"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_orders: {
        Row: {
          campaign_id: string | null
          coupon_code: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          line_items: Json
          monitor_id: string | null
          order_no: string
          ordered_at: string
          shopify_customer_id: string | null
          shopify_order_id: string
          status: Database["public"]["Enums"]["coupon_order_status"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          coupon_code: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          line_items?: Json
          monitor_id?: string | null
          order_no: string
          ordered_at: string
          shopify_customer_id?: string | null
          shopify_order_id: string
          status?: Database["public"]["Enums"]["coupon_order_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          coupon_code?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          line_items?: Json
          monitor_id?: string | null
          order_no?: string
          ordered_at?: string
          shopify_customer_id?: string | null
          shopify_order_id?: string
          status?: Database["public"]["Enums"]["coupon_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_orders_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          monitor_id: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          monitor_id: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          monitor_id?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          image_url: string | null
          shopify_product_id: string | null
          synced_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          shopify_product_id?: string | null
          synced_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          shopify_product_id?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          consent_ad: boolean
          consent_ec: boolean
          consent_sns: boolean
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          nickname: string | null
          notify_push: boolean
          push_token: string | null
          role: Database["public"]["Enums"]["profile_role"]
          shopify_customer_id: string | null
          status: Database["public"]["Enums"]["profile_status"]
          tos_agreed_at: string | null
          updated_at: string
          wifi_only_upload: boolean
        }
        Insert: {
          auth_user_id?: string | null
          consent_ad?: boolean
          consent_ec?: boolean
          consent_sns?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          nickname?: string | null
          notify_push?: boolean
          push_token?: string | null
          role: Database["public"]["Enums"]["profile_role"]
          shopify_customer_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          tos_agreed_at?: string | null
          updated_at?: string
          wifi_only_upload?: boolean
        }
        Update: {
          auth_user_id?: string | null
          consent_ad?: boolean
          consent_ec?: boolean
          consent_sns?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          nickname?: string | null
          notify_push?: boolean
          push_token?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          shopify_customer_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          tos_agreed_at?: string | null
          updated_at?: string
          wifi_only_upload?: boolean
        }
        Relationships: []
      }
      variants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          product_id: string
          shopify_variant_id: string | null
          size: string | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          product_id: string
          shopify_variant_id?: string | null
          size?: string | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          product_id?: string
          shopify_variant_id?: string | null
          size?: string | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_profile_id: { Args: never; Returns: string }
      current_profile_role: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_role"]
      }
    }
    Enums: {
      child_sex: "male" | "female"
      coupon_order_status: "pending" | "converted" | "skipped"
      profile_role: "admin" | "staff" | "monitor"
      profile_status: "invited" | "active" | "inactive"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      child_sex: ["male", "female"],
      coupon_order_status: ["pending", "converted", "skipped"],
      profile_role: ["admin", "staff", "monitor"],
      profile_status: ["invited", "active", "inactive"],
    },
  },
} as const
