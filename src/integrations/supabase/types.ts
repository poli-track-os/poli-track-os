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
  public: {
    Tables: {
      claims: {
        Row: {
          data_source: string
          entity_id: string
          extraction_confidence: number | null
          extraction_model: string | null
          id: string
          key: string
          observed_at: string
          source_url: string | null
          superseded_by: string | null
          trust_level: number | null
          valid_from: string | null
          valid_to: string | null
          value: Json
          value_type: string
        }
        Insert: {
          data_source: string
          entity_id: string
          extraction_confidence?: number | null
          extraction_model?: string | null
          id?: string
          key: string
          observed_at?: string
          source_url?: string | null
          superseded_by?: string | null
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value: Json
          value_type: string
        }
        Update: {
          data_source?: string
          entity_id?: string
          extraction_confidence?: number | null
          extraction_model?: string | null
          id?: string
          key?: string
          observed_at?: string
          source_url?: string | null
          superseded_by?: string | null
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      cofog_functions: {
        Row: {
          code: string
          color: string | null
          description: string | null
          icon: string | null
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          color?: string | null
          description?: string | null
          icon?: string | null
          label: string
          sort_order: number
        }
        Update: {
          code?: string
          color?: string | null
          description?: string | null
          icon?: string | null
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      country_demographics: {
        Row: {
          area_km2: number | null
          country_code: string
          created_at: string
          data_source: string
          fetched_at: string
          gdp_million_eur: number | null
          gdp_per_capita_eur: number | null
          population: number | null
          source_url: string | null
          updated_at: string
          year: number
        }
        Insert: {
          area_km2?: number | null
          country_code: string
          created_at?: string
          data_source: string
          fetched_at?: string
          gdp_million_eur?: number | null
          gdp_per_capita_eur?: number | null
          population?: number | null
          source_url?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          area_km2?: number | null
          country_code?: string
          created_at?: string
          data_source?: string
          fetched_at?: string
          gdp_million_eur?: number | null
          gdp_per_capita_eur?: number | null
          population?: number | null
          source_url?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      country_metadata: {
        Row: {
          area_km2: number | null
          capital: string | null
          coordinates: Json | null
          country_code: string
          country_name: string
          created_at: string
          description: string | null
          entity_id: string | null
          flag_emoji: string
          flag_image_url: string | null
          head_of_government: string | null
          head_of_state: string | null
          locator_map_url: string | null
          officeholders: Json
          population: number | null
          source_updated_at: string
          summary: string | null
          updated_at: string
          wikipedia_title: string | null
          wikipedia_url: string | null
        }
        Insert: {
          area_km2?: number | null
          capital?: string | null
          coordinates?: Json | null
          country_code: string
          country_name: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          flag_emoji: string
          flag_image_url?: string | null
          head_of_government?: string | null
          head_of_state?: string | null
          locator_map_url?: string | null
          officeholders?: Json
          population?: number | null
          source_updated_at?: string
          summary?: string | null
          updated_at?: string
          wikipedia_title?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          area_km2?: number | null
          capital?: string | null
          coordinates?: Json | null
          country_code?: string
          country_name?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          flag_emoji?: string
          flag_image_url?: string | null
          head_of_government?: string | null
          head_of_state?: string | null
          locator_map_url?: string | null
          officeholders?: Json
          population?: number | null
          source_updated_at?: string
          summary?: string | null
          updated_at?: string
          wikipedia_title?: string | null
          wikipedia_url?: string | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          base_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          name: string
          source_type: Database["public"]["Enums"]["data_source_type"]
          total_records: number | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name: string
          source_type: Database["public"]["Enums"]["data_source_type"]
          total_records?: number | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string
          source_type?: Database["public"]["Enums"]["data_source_type"]
          total_records?: number | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          canonical_name: string
          created_at: string
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          slug: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          slug: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          slug?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      entity_aliases: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          scheme: string
          source: string | null
          trust_level: number | null
          valid_from: string | null
          valid_to: string | null
          value: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          scheme: string
          source?: string | null
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          scheme?: string
          source?: string | null
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_aliases_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      government_expenditure: {
        Row: {
          amount_million_eur: number | null
          cofog_code: string
          cofog_label: string
          country_code: string
          created_at: string
          data_source: string
          fetched_at: string
          id: string
          is_provisional: boolean
          na_item: string
          pct_of_gdp: number | null
          pct_of_total_expenditure: number | null
          sector: string
          source_url: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_million_eur?: number | null
          cofog_code: string
          cofog_label: string
          country_code: string
          created_at?: string
          data_source?: string
          fetched_at?: string
          id?: string
          is_provisional?: boolean
          na_item?: string
          pct_of_gdp?: number | null
          pct_of_total_expenditure?: number | null
          sector?: string
          source_url?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_million_eur?: number | null
          cofog_code?: string
          cofog_label?: string
          country_code?: string
          created_at?: string
          data_source?: string
          fetched_at?: string
          id?: string
          is_provisional?: boolean
          na_item?: string
          pct_of_gdp?: number | null
          pct_of_total_expenditure?: number | null
          sector?: string
          source_url?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      lobby_meetings: {
        Row: {
          commissioner_org: string | null
          created_at: string
          data_source: string
          fetched_at: string
          id: string
          lobby_id: string | null
          meeting_date: string
          politician_id: string | null
          role_of_politician: string | null
          source_url: string | null
          subject: string | null
        }
        Insert: {
          commissioner_org?: string | null
          created_at?: string
          data_source: string
          fetched_at?: string
          id?: string
          lobby_id?: string | null
          meeting_date: string
          politician_id?: string | null
          role_of_politician?: string | null
          source_url?: string | null
          subject?: string | null
        }
        Update: {
          commissioner_org?: string | null
          created_at?: string
          data_source?: string
          fetched_at?: string
          id?: string
          lobby_id?: string | null
          meeting_date?: string
          politician_id?: string | null
          role_of_politician?: string | null
          source_url?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lobby_meetings_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobby_organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_meetings_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_organisations: {
        Row: {
          accreditation_count: number | null
          category: string | null
          country_of_hq: string | null
          created_at: string
          data_source: string
          fetched_at: string
          id: string
          last_updated_tr: string | null
          legal_name: string | null
          name: string
          registered_at: string | null
          source_url: string | null
          subcategory: string | null
          transparency_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          accreditation_count?: number | null
          category?: string | null
          country_of_hq?: string | null
          created_at?: string
          data_source?: string
          fetched_at?: string
          id?: string
          last_updated_tr?: string | null
          legal_name?: string | null
          name: string
          registered_at?: string | null
          source_url?: string | null
          subcategory?: string | null
          transparency_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          accreditation_count?: number | null
          category?: string | null
          country_of_hq?: string | null
          created_at?: string
          data_source?: string
          fetched_at?: string
          id?: string
          last_updated_tr?: string | null
          legal_name?: string | null
          name?: string
          registered_at?: string | null
          source_url?: string | null
          subcategory?: string | null
          transparency_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      lobby_spend: {
        Row: {
          category_breakdown: Json | null
          created_at: string
          data_source: string
          declared_amount_eur_high: number | null
          declared_amount_eur_low: number | null
          fetched_at: string
          full_time_equivalents: number | null
          id: string
          lobby_id: string
          source_url: string | null
          year: number
        }
        Insert: {
          category_breakdown?: Json | null
          created_at?: string
          data_source: string
          declared_amount_eur_high?: number | null
          declared_amount_eur_low?: number | null
          fetched_at?: string
          full_time_equivalents?: number | null
          id?: string
          lobby_id: string
          source_url?: string | null
          year: number
        }
        Update: {
          category_breakdown?: Json | null
          created_at?: string
          data_source?: string
          declared_amount_eur_high?: number | null
          declared_amount_eur_low?: number | null
          fetched_at?: string
          full_time_equivalents?: number | null
          id?: string
          lobby_id?: string
          source_url?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "lobby_spend_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobby_organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      political_events: {
        Row: {
          created_at: string
          description: string | null
          diff_added: string | null
          diff_removed: string | null
          entities: string[] | null
          event_timestamp: string
          event_type: Database["public"]["Enums"]["political_event_type"]
          evidence_count: number | null
          extraction_confidence: number | null
          extraction_model: string | null
          hash: string
          id: string
          politician_id: string
          raw_data: Json | null
          sentiment: Database["public"]["Enums"]["sentiment_type"] | null
          source: Database["public"]["Enums"]["data_source_type"] | null
          source_handle: string | null
          source_url: string | null
          title: string
          trust_level: number | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          diff_added?: string | null
          diff_removed?: string | null
          entities?: string[] | null
          event_timestamp?: string
          event_type: Database["public"]["Enums"]["political_event_type"]
          evidence_count?: number | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          hash?: string
          id?: string
          politician_id: string
          raw_data?: Json | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          source?: Database["public"]["Enums"]["data_source_type"] | null
          source_handle?: string | null
          source_url?: string | null
          title: string
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          diff_added?: string | null
          diff_removed?: string | null
          entities?: string[] | null
          event_timestamp?: string
          event_type?: Database["public"]["Enums"]["political_event_type"]
          evidence_count?: number | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          hash?: string
          id?: string
          politician_id?: string
          raw_data?: Json | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          source?: Database["public"]["Enums"]["data_source_type"] | null
          source_handle?: string | null
          source_url?: string | null
          title?: string
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "political_events_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_associations: {
        Row: {
          associate_id: string
          context: string | null
          created_at: string
          id: string
          is_domestic: boolean
          politician_id: string
          relationship_type: string
          strength: number
        }
        Insert: {
          associate_id: string
          context?: string | null
          created_at?: string
          id?: string
          is_domestic?: boolean
          politician_id: string
          relationship_type?: string
          strength?: number
        }
        Update: {
          associate_id?: string
          context?: string | null
          created_at?: string
          id?: string
          is_domestic?: boolean
          politician_id?: string
          relationship_type?: string
          strength?: number
        }
        Relationships: [
          {
            foreignKeyName: "politician_associations_associate_id_fkey"
            columns: ["associate_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politician_associations_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_finances: {
        Row: {
          annual_salary: number | null
          created_at: string
          currency: string | null
          declaration_year: number | null
          declared_assets: number | null
          declared_debt: number | null
          id: string
          notes: string | null
          politician_id: string
          property_value: number | null
          salary_source: string | null
          side_income: number | null
          updated_at: string
        }
        Insert: {
          annual_salary?: number | null
          created_at?: string
          currency?: string | null
          declaration_year?: number | null
          declared_assets?: number | null
          declared_debt?: number | null
          id?: string
          notes?: string | null
          politician_id: string
          property_value?: number | null
          salary_source?: string | null
          side_income?: number | null
          updated_at?: string
        }
        Update: {
          annual_salary?: number | null
          created_at?: string
          currency?: string | null
          declaration_year?: number | null
          declared_assets?: number | null
          declared_debt?: number | null
          id?: string
          notes?: string | null
          politician_id?: string
          property_value?: number | null
          salary_source?: string | null
          side_income?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "politician_finances_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_investments: {
        Row: {
          company_name: string
          created_at: string
          currency: string | null
          disclosure_date: string | null
          estimated_value: number | null
          id: string
          investment_type: string
          is_active: boolean | null
          notes: string | null
          politician_id: string
          sector: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          currency?: string | null
          disclosure_date?: string | null
          estimated_value?: number | null
          id?: string
          investment_type?: string
          is_active?: boolean | null
          notes?: string | null
          politician_id: string
          sector?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          currency?: string | null
          disclosure_date?: string | null
          estimated_value?: number | null
          id?: string
          investment_type?: string
          is_active?: boolean | null
          notes?: string | null
          politician_id?: string
          sector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politician_investments_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_positions: {
        Row: {
          created_at: string
          data_source: string | null
          defense_priority: number | null
          economic_score: number | null
          economy_priority: number | null
          education_priority: number | null
          environment_priority: number | null
          environmental_score: number | null
          eu_integration_score: number | null
          healthcare_priority: number | null
          id: string
          ideology_label: string | null
          immigration_score: number | null
          justice_priority: number | null
          key_positions: Json | null
          politician_id: string
          science_priority: number | null
          social_score: number | null
          social_welfare_priority: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          defense_priority?: number | null
          economic_score?: number | null
          economy_priority?: number | null
          education_priority?: number | null
          environment_priority?: number | null
          environmental_score?: number | null
          eu_integration_score?: number | null
          healthcare_priority?: number | null
          id?: string
          ideology_label?: string | null
          immigration_score?: number | null
          justice_priority?: number | null
          key_positions?: Json | null
          politician_id: string
          science_priority?: number | null
          social_score?: number | null
          social_welfare_priority?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: string | null
          defense_priority?: number | null
          economic_score?: number | null
          economy_priority?: number | null
          education_priority?: number | null
          environment_priority?: number | null
          environmental_score?: number | null
          eu_integration_score?: number | null
          healthcare_priority?: number | null
          id?: string
          ideology_label?: string | null
          immigration_score?: number | null
          justice_priority?: number | null
          key_positions?: Json | null
          politician_id?: string
          science_priority?: number | null
          social_score?: number | null
          social_welfare_priority?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "politician_positions_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: true
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politicians: {
        Row: {
          biography: string | null
          birth_year: number | null
          committees: string[] | null
          continent: string | null
          country_code: string
          country_name: string
          created_at: string
          data_source: Database["public"]["Enums"]["data_source_type"] | null
          enriched_at: string | null
          entity_id: string | null
          external_id: string | null
          id: string
          in_office_since: string | null
          jurisdiction: string | null
          name: string
          party_abbreviation: string | null
          party_name: string | null
          photo_url: string | null
          role: string | null
          source_attribution: Json
          source_url: string | null
          twitter_handle: string | null
          updated_at: string
          wikipedia_data: Json | null
          wikipedia_image_url: string | null
          wikipedia_summary: string | null
          wikipedia_url: string | null
        }
        Insert: {
          biography?: string | null
          birth_year?: number | null
          committees?: string[] | null
          continent?: string | null
          country_code: string
          country_name: string
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source_type"] | null
          enriched_at?: string | null
          entity_id?: string | null
          external_id?: string | null
          id?: string
          in_office_since?: string | null
          jurisdiction?: string | null
          name: string
          party_abbreviation?: string | null
          party_name?: string | null
          photo_url?: string | null
          role?: string | null
          source_attribution?: Json
          source_url?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wikipedia_data?: Json | null
          wikipedia_image_url?: string | null
          wikipedia_summary?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          biography?: string | null
          birth_year?: number | null
          committees?: string[] | null
          continent?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source_type"] | null
          enriched_at?: string | null
          entity_id?: string | null
          external_id?: string | null
          id?: string
          in_office_since?: string | null
          jurisdiction?: string | null
          name?: string
          party_abbreviation?: string | null
          party_name?: string | null
          photo_url?: string | null
          role?: string | null
          source_attribution?: Json
          source_url?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wikipedia_data?: Json | null
          wikipedia_image_url?: string | null
          wikipedia_summary?: string | null
          wikipedia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicians_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          affected_laws: string[] | null
          country_code: string
          country_name: string
          created_at: string
          data_source: string
          entity_id: string | null
          evidence_count: number | null
          id: string
          jurisdiction: string
          official_title: string | null
          policy_area: string | null
          proposal_type: string
          source_url: string | null
          sponsors: string[] | null
          status: string
          submitted_date: string
          summary: string | null
          title: string
          updated_at: string
          vote_date: string | null
        }
        Insert: {
          affected_laws?: string[] | null
          country_code?: string
          country_name?: string
          created_at?: string
          data_source?: string
          entity_id?: string | null
          evidence_count?: number | null
          id?: string
          jurisdiction?: string
          official_title?: string | null
          policy_area?: string | null
          proposal_type?: string
          source_url?: string | null
          sponsors?: string[] | null
          status?: string
          submitted_date?: string
          summary?: string | null
          title: string
          updated_at?: string
          vote_date?: string | null
        }
        Update: {
          affected_laws?: string[] | null
          country_code?: string
          country_name?: string
          created_at?: string
          data_source?: string
          entity_id?: string | null
          evidence_count?: number | null
          id?: string
          jurisdiction?: string
          official_title?: string | null
          policy_area?: string | null
          proposal_type?: string
          source_url?: string | null
          sponsors?: string[] | null
          status?: string
          submitted_date?: string
          summary?: string | null
          title?: string
          updated_at?: string
          vote_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_vote_events: {
        Row: {
          id: string
          proposal_id: string
          source_event_id: string
          chamber: string | null
          vote_method: string | null
          happened_at: string | null
          result: string | null
          for_count: number | null
          against_count: number | null
          abstain_count: number | null
          absent_count: number | null
          total_eligible: number | null
          total_cast: number | null
          quorum_required: number | null
          quorum_reached: boolean | null
          source_url: string | null
          source_payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          source_event_id: string
          chamber?: string | null
          vote_method?: string | null
          happened_at?: string | null
          result?: string | null
          for_count?: number | null
          against_count?: number | null
          abstain_count?: number | null
          absent_count?: number | null
          total_eligible?: number | null
          total_cast?: number | null
          quorum_required?: number | null
          quorum_reached?: boolean | null
          source_url?: string | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          source_event_id?: string
          chamber?: string | null
          vote_method?: string | null
          happened_at?: string | null
          result?: string | null
          for_count?: number | null
          against_count?: number | null
          abstain_count?: number | null
          absent_count?: number | null
          total_eligible?: number | null
          total_cast?: number | null
          quorum_required?: number | null
          quorum_reached?: boolean | null
          source_url?: string | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_vote_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_vote_groups: {
        Row: {
          id: string
          proposal_id: string
          event_id: string
          source_group_id: string
          group_type: string
          group_name: string
          for_count: number | null
          against_count: number | null
          abstain_count: number | null
          absent_count: number | null
          source_payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          event_id: string
          source_group_id: string
          group_type: string
          group_name: string
          for_count?: number | null
          against_count?: number | null
          abstain_count?: number | null
          absent_count?: number | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          event_id?: string
          source_group_id?: string
          group_type?: string
          group_name?: string
          for_count?: number | null
          against_count?: number | null
          abstain_count?: number | null
          absent_count?: number | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_vote_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "proposal_vote_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_vote_groups_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_vote_records: {
        Row: {
          id: string
          proposal_id: string
          event_id: string
          source_record_id: string
          politician_id: string | null
          voter_name: string
          party: string | null
          vote_position: string
          confidence: number | null
          source_payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          event_id: string
          source_record_id: string
          politician_id?: string | null
          voter_name: string
          party?: string | null
          vote_position: string
          confidence?: number | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          event_id?: string
          source_record_id?: string
          politician_id?: string | null
          voter_name?: string
          party?: string | null
          vote_position?: string
          confidence?: number | null
          source_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_vote_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "proposal_vote_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_vote_records_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_vote_records_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_tweets: {
        Row: {
          archive_source: string
          body: string
          fetched_at: string
          handle: string
          id: string
          in_reply_to: string | null
          lang: string | null
          politician_id: string | null
          posted_at: string | null
          processed_at: string | null
          retweet_of: string | null
          source_url: string | null
          tweet_id: string
        }
        Insert: {
          archive_source: string
          body: string
          fetched_at?: string
          handle: string
          id?: string
          in_reply_to?: string | null
          lang?: string | null
          politician_id?: string | null
          posted_at?: string | null
          processed_at?: string | null
          retweet_of?: string | null
          source_url?: string | null
          tweet_id: string
        }
        Update: {
          archive_source?: string
          body?: string
          fetched_at?: string
          handle?: string
          id?: string
          in_reply_to?: string | null
          lang?: string | null
          politician_id?: string | null
          posted_at?: string | null
          processed_at?: string | null
          retweet_of?: string | null
          source_url?: string | null
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_tweets_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          context: string | null
          data_source: string
          id: string
          object_id: string
          observed_at: string
          predicate: string
          role: string | null
          source_url: string | null
          strength: number | null
          subject_id: string
          trust_level: number | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          context?: string | null
          data_source: string
          id?: string
          object_id: string
          observed_at?: string
          predicate: string
          role?: string | null
          source_url?: string | null
          strength?: number | null
          subject_id: string
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          context?: string | null
          data_source?: string
          id?: string
          object_id?: string
          observed_at?: string
          predicate?: string
          role?: string | null
          source_url?: string | null
          strength?: number | null
          subject_id?: string
          trust_level?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationships_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          error_message: string | null
          id: string
          parent_run_id: string | null
          records_created: number | null
          records_fetched: number | null
          records_updated: number | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["data_source_type"]
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          parent_run_id?: string | null
          records_created?: number | null
          records_fetched?: number | null
          records_updated?: number | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["data_source_type"]
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          parent_run_id?: string | null
          records_created?: number | null
          records_fetched?: number | null
          records_updated?: number | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["data_source_type"]
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          content_hash: string | null
          data_source: string
          fetched_at: string
          id: string
          mime_type: string | null
          published_at: string | null
          publisher: string | null
          title: string | null
          url: string
        }
        Insert: {
          content_hash?: string | null
          data_source: string
          fetched_at?: string
          id?: string
          mime_type?: string | null
          published_at?: string | null
          publisher?: string | null
          title?: string | null
          url: string
        }
        Update: {
          content_hash?: string | null
          data_source?: string
          fetched_at?: string
          id?: string
          mime_type?: string | null
          published_at?: string | null
          publisher?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      politician_data_observatory_overview: {
        Row: {
          birth_year: number | null
          country_code: string
          country_name: string
          enriched_at: string | null
          has_biography: boolean
          has_photo: boolean
          id: string
          jurisdiction: string | null
          name: string
          party_abbreviation: string | null
          party_name: string | null
          role: string | null
          twitter_handle: string | null
          wikipedia_url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_political_event_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_proposal_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      increment_total_records: {
        Args: {
          p_delta: number
          p_source_type: Database["public"]["Enums"]["data_source_type"]
        }
        Returns: undefined
      }
    }
    Enums: {
      data_source_type:
        | "eu_parliament"
        | "un_digital_library"
        | "twitter"
        | "official_record"
        | "news"
        | "financial_filing"
        | "parliamentary_record"
        | "court_filing"
        | "lobby_register"
        | "wikipedia"
        | "parltrack"
        | "transparency_register"
        | "lobbyfacts"
        | "eurostat_cofog"
        | "eurostat_macro"
        | "integrity_watch"
        | "gdelt"
        | "archive_twitter"
        | "llm_extraction"
        | "opencorporates"
        | "transparency_international"
      political_event_type:
        | "vote"
        | "speech"
        | "committee_join"
        | "committee_leave"
        | "election"
        | "appointment"
        | "resignation"
        | "scandal"
        | "policy_change"
        | "party_switch"
        | "legislation_sponsored"
        | "foreign_meeting"
        | "lobbying_meeting"
        | "corporate_event"
        | "financial_disclosure"
        | "social_media"
        | "travel"
        | "donation_received"
        | "public_statement"
        | "court_case"
        | "media_appearance"
      sentiment_type: "positive" | "negative" | "neutral"
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
      data_source_type: [
        "eu_parliament",
        "un_digital_library",
        "twitter",
        "official_record",
        "news",
        "financial_filing",
        "parliamentary_record",
        "court_filing",
        "lobby_register",
        "wikipedia",
        "parltrack",
        "transparency_register",
        "lobbyfacts",
        "eurostat_cofog",
        "eurostat_macro",
        "integrity_watch",
        "gdelt",
        "archive_twitter",
        "llm_extraction",
        "opencorporates",
        "transparency_international",
      ],
      political_event_type: [
        "vote",
        "speech",
        "committee_join",
        "committee_leave",
        "election",
        "appointment",
        "resignation",
        "scandal",
        "policy_change",
        "party_switch",
        "legislation_sponsored",
        "foreign_meeting",
        "lobbying_meeting",
        "corporate_event",
        "financial_disclosure",
        "social_media",
        "travel",
        "donation_received",
        "public_statement",
        "court_case",
        "media_appearance",
      ],
      sentiment_type: ["positive", "negative", "neutral"],
    },
  },
} as const
