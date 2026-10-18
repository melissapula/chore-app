export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: '14.5';
    };
    chore: {
        Tables: {
            chore_instances: {
                Row: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                Insert: {
                    approved_at?: string | null;
                    approved_by?: string | null;
                    assigned_to?: string | null;
                    chore_id: string;
                    claimed_at?: string | null;
                    claimed_by?: string | null;
                    created_at?: string;
                    due_date?: string | null;
                    finish_deadline?: string | null;
                    finish_notified_at?: string | null;
                    gates_pay?: boolean;
                    household_id: string;
                    id?: string;
                    start_deadline?: string | null;
                    started_at?: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at?: string | null;
                    value_cents_snapshot?: number;
                };
                Update: {
                    approved_at?: string | null;
                    approved_by?: string | null;
                    assigned_to?: string | null;
                    chore_id?: string;
                    claimed_at?: string | null;
                    claimed_by?: string | null;
                    created_at?: string;
                    due_date?: string | null;
                    finish_deadline?: string | null;
                    finish_notified_at?: string | null;
                    gates_pay?: boolean;
                    household_id?: string;
                    id?: string;
                    start_deadline?: string | null;
                    started_at?: string | null;
                    state?: Database['chore']['Enums']['instance_state'];
                    submitted_at?: string | null;
                    value_cents_snapshot?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: 'chore_instances_approved_by_fkey';
                        columns: ['approved_by'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_instances_assigned_to_fkey';
                        columns: ['assigned_to'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_instances_chore_id_fkey';
                        columns: ['chore_id'];
                        isOneToOne: false;
                        referencedRelation: 'chores';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_instances_claimed_by_fkey';
                        columns: ['claimed_by'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_instances_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                ];
            };
            chore_requests: {
                Row: {
                    chore_id: string | null;
                    created_at: string;
                    household_id: string;
                    id: string;
                    note: string | null;
                    requested_by: string;
                    resolved_at: string | null;
                    resolved_by: string | null;
                    status: Database['chore']['Enums']['request_status'];
                    suggested_xp: number | null;
                    title: string;
                };
                Insert: {
                    chore_id?: string | null;
                    created_at?: string;
                    household_id: string;
                    id?: string;
                    note?: string | null;
                    requested_by: string;
                    resolved_at?: string | null;
                    resolved_by?: string | null;
                    status?: Database['chore']['Enums']['request_status'];
                    suggested_xp?: number | null;
                    title: string;
                };
                Update: {
                    chore_id?: string | null;
                    created_at?: string;
                    household_id?: string;
                    id?: string;
                    note?: string | null;
                    requested_by?: string;
                    resolved_at?: string | null;
                    resolved_by?: string | null;
                    status?: Database['chore']['Enums']['request_status'];
                    suggested_xp?: number | null;
                    title?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'chore_requests_chore_id_fkey';
                        columns: ['chore_id'];
                        isOneToOne: false;
                        referencedRelation: 'chores';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_requests_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_requests_requested_by_fkey';
                        columns: ['requested_by'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chore_requests_resolved_by_fkey';
                        columns: ['resolved_by'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            chores: {
                Row: {
                    active: boolean;
                    assigned_kid_id: string | null;
                    category: string | null;
                    chore_type: Database['chore']['Enums']['chore_type'];
                    created_at: string;
                    due_type: Database['chore']['Enums']['due_kind'] | null;
                    eligible_kid_ids: string[] | null;
                    est_minutes: number | null;
                    finish_timer_mins: number | null;
                    gates_pay: boolean;
                    household_id: string;
                    icon_emoji: string | null;
                    id: string;
                    is_risky: boolean;
                    quest_title: string | null;
                    recurrence: Database['chore']['Enums']['recurrence_kind'];
                    recurrence_config: Json | null;
                    start_timer_mins: number | null;
                    title: string;
                    value_cents: number;
                };
                Insert: {
                    active?: boolean;
                    assigned_kid_id?: string | null;
                    category?: string | null;
                    chore_type: Database['chore']['Enums']['chore_type'];
                    created_at?: string;
                    due_type?: Database['chore']['Enums']['due_kind'] | null;
                    eligible_kid_ids?: string[] | null;
                    est_minutes?: number | null;
                    finish_timer_mins?: number | null;
                    gates_pay?: boolean;
                    household_id: string;
                    icon_emoji?: string | null;
                    id?: string;
                    is_risky?: boolean;
                    quest_title?: string | null;
                    recurrence?: Database['chore']['Enums']['recurrence_kind'];
                    recurrence_config?: Json | null;
                    start_timer_mins?: number | null;
                    title: string;
                    value_cents?: number;
                };
                Update: {
                    active?: boolean;
                    assigned_kid_id?: string | null;
                    category?: string | null;
                    chore_type?: Database['chore']['Enums']['chore_type'];
                    created_at?: string;
                    due_type?: Database['chore']['Enums']['due_kind'] | null;
                    eligible_kid_ids?: string[] | null;
                    est_minutes?: number | null;
                    finish_timer_mins?: number | null;
                    gates_pay?: boolean;
                    household_id?: string;
                    icon_emoji?: string | null;
                    id?: string;
                    is_risky?: boolean;
                    quest_title?: string | null;
                    recurrence?: Database['chore']['Enums']['recurrence_kind'];
                    recurrence_config?: Json | null;
                    start_timer_mins?: number | null;
                    title?: string;
                    value_cents?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: 'chores_assigned_kid_id_fkey';
                        columns: ['assigned_kid_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'chores_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                ];
            };
            households: {
                Row: {
                    created_at: string;
                    default_finish_timer_mins: number;
                    default_start_timer_mins: number;
                    id: string;
                    join_code: string | null;
                    join_code_expires_at: string | null;
                    name: string;
                };
                Insert: {
                    created_at?: string;
                    default_finish_timer_mins?: number;
                    default_start_timer_mins?: number;
                    id?: string;
                    join_code?: string | null;
                    join_code_expires_at?: string | null;
                    name: string;
                };
                Update: {
                    created_at?: string;
                    default_finish_timer_mins?: number;
                    default_start_timer_mins?: number;
                    id?: string;
                    join_code?: string | null;
                    join_code_expires_at?: string | null;
                    name?: string;
                };
                Relationships: [];
            };
            ledger_entries: {
                Row: {
                    chore_instance_id: string | null;
                    created_at: string;
                    delta_cents: number;
                    household_id: string;
                    id: string;
                    kid_id: string;
                    note: string | null;
                    quest_id: string | null;
                    reason: Database['chore']['Enums']['ledger_reason'];
                };
                Insert: {
                    chore_instance_id?: string | null;
                    created_at?: string;
                    delta_cents: number;
                    household_id: string;
                    id?: string;
                    kid_id: string;
                    note?: string | null;
                    quest_id?: string | null;
                    reason: Database['chore']['Enums']['ledger_reason'];
                };
                Update: {
                    chore_instance_id?: string | null;
                    created_at?: string;
                    delta_cents?: number;
                    household_id?: string;
                    id?: string;
                    kid_id?: string;
                    note?: string | null;
                    quest_id?: string | null;
                    reason?: Database['chore']['Enums']['ledger_reason'];
                };
                Relationships: [
                    {
                        foreignKeyName: 'ledger_entries_chore_instance_id_fkey';
                        columns: ['chore_instance_id'];
                        isOneToOne: false;
                        referencedRelation: 'chore_instances';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'ledger_entries_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'ledger_entries_kid_id_fkey';
                        columns: ['kid_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'ledger_entries_quest_id_fkey';
                        columns: ['quest_id'];
                        isOneToOne: false;
                        referencedRelation: 'quests';
                        referencedColumns: ['id'];
                    },
                ];
            };
            notes: {
                Row: {
                    author_id: string;
                    body: string;
                    chore_instance_id: string | null;
                    created_at: string;
                    household_id: string;
                    id: string;
                    recipient_id: string | null;
                };
                Insert: {
                    author_id: string;
                    body: string;
                    chore_instance_id?: string | null;
                    created_at?: string;
                    household_id: string;
                    id?: string;
                    recipient_id?: string | null;
                };
                Update: {
                    author_id?: string;
                    body?: string;
                    chore_instance_id?: string | null;
                    created_at?: string;
                    household_id?: string;
                    id?: string;
                    recipient_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'notes_author_id_fkey';
                        columns: ['author_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'notes_chore_instance_id_fkey';
                        columns: ['chore_instance_id'];
                        isOneToOne: false;
                        referencedRelation: 'chore_instances';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'notes_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'notes_recipient_id_fkey';
                        columns: ['recipient_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            push_subscriptions: {
                Row: {
                    auth: string;
                    created_at: string;
                    endpoint: string;
                    household_id: string;
                    id: string;
                    p256dh: string;
                    user_id: string;
                };
                Insert: {
                    auth: string;
                    created_at?: string;
                    endpoint: string;
                    household_id: string;
                    id?: string;
                    p256dh: string;
                    user_id: string;
                };
                Update: {
                    auth?: string;
                    created_at?: string;
                    endpoint?: string;
                    household_id?: string;
                    id?: string;
                    p256dh?: string;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'push_subscriptions_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'push_subscriptions_user_id_fkey';
                        columns: ['user_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            quests: {
                Row: {
                    created_at: string;
                    deadline: string | null;
                    emoji: string | null;
                    household_id: string;
                    id: string;
                    kid_id: string | null;
                    redeemed_at: string | null;
                    reward: string | null;
                    scope: Database['chore']['Enums']['quest_scope'];
                    started_at: string;
                    status: Database['chore']['Enums']['quest_status'];
                    target_xp: number;
                    title: string;
                };
                Insert: {
                    created_at?: string;
                    deadline?: string | null;
                    emoji?: string | null;
                    household_id: string;
                    id?: string;
                    kid_id?: string | null;
                    redeemed_at?: string | null;
                    reward?: string | null;
                    scope?: Database['chore']['Enums']['quest_scope'];
                    started_at?: string;
                    status?: Database['chore']['Enums']['quest_status'];
                    target_xp: number;
                    title: string;
                };
                Update: {
                    created_at?: string;
                    deadline?: string | null;
                    emoji?: string | null;
                    household_id?: string;
                    id?: string;
                    kid_id?: string | null;
                    redeemed_at?: string | null;
                    reward?: string | null;
                    scope?: Database['chore']['Enums']['quest_scope'];
                    started_at?: string;
                    status?: Database['chore']['Enums']['quest_status'];
                    target_xp?: number;
                    title?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'quests_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'quests_kid_id_fkey';
                        columns: ['kid_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            users: {
                Row: {
                    avatar_emoji: string | null;
                    avatar_url: string | null;
                    birthdate: string | null;
                    created_at: string;
                    display_name: string;
                    household_id: string;
                    id: string;
                    role: Database['chore']['Enums']['user_role'];
                    username: string | null;
                };
                Insert: {
                    avatar_emoji?: string | null;
                    avatar_url?: string | null;
                    birthdate?: string | null;
                    created_at?: string;
                    display_name: string;
                    household_id: string;
                    id: string;
                    role: Database['chore']['Enums']['user_role'];
                    username?: string | null;
                };
                Update: {
                    avatar_emoji?: string | null;
                    avatar_url?: string | null;
                    birthdate?: string | null;
                    created_at?: string;
                    display_name?: string;
                    household_id?: string;
                    id?: string;
                    role?: Database['chore']['Enums']['user_role'];
                    username?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'users_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                ];
            };
            weekly_gates: {
                Row: {
                    created_at: string;
                    decided_at: string | null;
                    decided_by: string | null;
                    earned_cents: number;
                    household_id: string;
                    id: string;
                    kid_id: string;
                    required_done: number;
                    required_total: number;
                    status: Database['chore']['Enums']['gate_status'];
                    week_start: string;
                };
                Insert: {
                    created_at?: string;
                    decided_at?: string | null;
                    decided_by?: string | null;
                    earned_cents?: number;
                    household_id: string;
                    id?: string;
                    kid_id: string;
                    required_done?: number;
                    required_total?: number;
                    status?: Database['chore']['Enums']['gate_status'];
                    week_start: string;
                };
                Update: {
                    created_at?: string;
                    decided_at?: string | null;
                    decided_by?: string | null;
                    earned_cents?: number;
                    household_id?: string;
                    id?: string;
                    kid_id?: string;
                    required_done?: number;
                    required_total?: number;
                    status?: Database['chore']['Enums']['gate_status'];
                    week_start?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'weekly_gates_decided_by_fkey';
                        columns: ['decided_by'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'weekly_gates_household_id_fkey';
                        columns: ['household_id'];
                        isOneToOne: false;
                        referencedRelation: 'households';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'weekly_gates_kid_id_fkey';
                        columns: ['kid_id'];
                        isOneToOne: false;
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            app_household_id: { Args: never; Returns: string };
            app_is_parent: { Args: never; Returns: boolean };
            app_role: { Args: never; Returns: string };
            approve_paid_instance: {
                Args: { p_instance_id: string };
                Returns: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                SetofOptions: {
                    from: '*';
                    to: 'chore_instances';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            bootstrap_household: {
                Args: {
                    avatar_emoji?: string;
                    display_name: string;
                    household_name: string;
                };
                Returns: string;
            };
            claim_instance: {
                Args: { p_instance_id: string };
                Returns: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                SetofOptions: {
                    from: '*';
                    to: 'chore_instances';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            join_household: {
                Args: {
                    avatar_emoji?: string;
                    display_name: string;
                    invite_code: string;
                };
                Returns: string;
            };
            mark_done_instance: {
                Args: { p_instance_id: string };
                Returns: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                SetofOptions: {
                    from: '*';
                    to: 'chore_instances';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            redeem_quest: {
                Args: { p_quest_id: string };
                Returns: {
                    created_at: string;
                    deadline: string | null;
                    emoji: string | null;
                    household_id: string;
                    id: string;
                    kid_id: string | null;
                    redeemed_at: string | null;
                    reward: string | null;
                    scope: Database['chore']['Enums']['quest_scope'];
                    started_at: string;
                    status: Database['chore']['Enums']['quest_status'];
                    target_xp: number;
                    title: string;
                };
                SetofOptions: {
                    from: '*';
                    to: 'quests';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            regenerate_join_code: { Args: never; Returns: string };
            start_instance: {
                Args: { p_instance_id: string };
                Returns: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                SetofOptions: {
                    from: '*';
                    to: 'chore_instances';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            submit_instance: {
                Args: { p_instance_id: string };
                Returns: {
                    approved_at: string | null;
                    approved_by: string | null;
                    assigned_to: string | null;
                    chore_id: string;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    due_date: string | null;
                    finish_deadline: string | null;
                    finish_notified_at: string | null;
                    gates_pay: boolean;
                    household_id: string;
                    id: string;
                    start_deadline: string | null;
                    started_at: string | null;
                    state: Database['chore']['Enums']['instance_state'];
                    submitted_at: string | null;
                    value_cents_snapshot: number;
                };
                SetofOptions: {
                    from: '*';
                    to: 'chore_instances';
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
        };
        Enums: {
            chore_type: 'paid' | 'required';
            due_kind: 'end_of_day' | 'end_of_week';
            gate_status: 'met' | 'unmet' | 'parent_released' | 'parent_held';
            instance_state:
                | 'OPEN'
                | 'CLAIMED'
                | 'IN_PROGRESS'
                | 'SUBMITTED'
                | 'APPROVED'
                | 'ASSIGNED'
                | 'CONFIRMED'
                | 'MISSED';
            ledger_reason:
                | 'chore_approved'
                | 'goal_allocation'
                | 'parent_adjustment'
                | 'payout'
                | 'quest_redeemed';
            quest_scope: 'personal' | 'guild';
            quest_status: 'active' | 'redeemed' | 'archived';
            recurrence_kind: 'once' | 'daily' | 'weekly' | 'custom';
            request_status: 'pending' | 'approved' | 'declined';
            user_role: 'parent' | 'kid';
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
    keyof Database,
    'public'
>];

export type Tables<
    DefaultSchemaTableNameOrOptions extends
        | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
              DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
          DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
          Row: infer R;
      }
        ? R
        : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
            DefaultSchema['Views'])
      ? (DefaultSchema['Tables'] &
            DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R;
        }
          ? R
          : never
      : never;

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Insert: infer I;
      }
        ? I
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I;
        }
          ? I
          : never
      : never;

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends (DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Update: infer U;
      }
        ? U
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U;
        }
          ? U
          : never
      : never;

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
        | keyof DefaultSchema['Enums']
        | { schema: keyof DatabaseWithoutInternals },
    EnumName extends (DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
        : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
      ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
      : never;

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof DefaultSchema['CompositeTypes']
        | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
        : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
      ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
      : never;

export const Constants = {
    chore: {
        Enums: {
            chore_type: ['paid', 'required'],
            due_kind: ['end_of_day', 'end_of_week'],
            gate_status: ['met', 'unmet', 'parent_released', 'parent_held'],
            instance_state: [
                'OPEN',
                'CLAIMED',
                'IN_PROGRESS',
                'SUBMITTED',
                'APPROVED',
                'ASSIGNED',
                'CONFIRMED',
                'MISSED',
            ],
            ledger_reason: [
                'chore_approved',
                'goal_allocation',
                'parent_adjustment',
                'payout',
                'quest_redeemed',
            ],
            quest_scope: ['personal', 'guild'],
            quest_status: ['active', 'redeemed', 'archived'],
            recurrence_kind: ['once', 'daily', 'weekly', 'custom'],
            request_status: ['pending', 'approved', 'declined'],
            user_role: ['parent', 'kid'],
        },
    },
} as const;
