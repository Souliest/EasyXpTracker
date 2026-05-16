// common/realtime.js
// Shared Supabase Realtime subscription factory.
//
// All three hybrid-storage tools (LevelGoalTracker, ThingCounter, TrophyHunter)
// previously duplicated identical subscribe/unsubscribe logic — differing only
// in channel name prefix and table name. This module provides a single factory
// that returns a { subscribe, unsubscribe } pair, eliminating that duplication.
//
// Usage (in each tool's storage.js):
//
//   import { createRealtimeSubscription } from '../../common/realtime.js';
//   const _rt = createRealtimeSubscription('lgt-games', 'bgt_level_goal_tracker_games');
//   export const subscribeToGameChanges     = _rt.subscribe;
//   export const unsubscribeFromGameChanges = _rt.unsubscribe;

import {supabase} from './supabase.js';

// ── Factory ───────────────────────────────────────────────────────────────────
// channelPrefix  — short stable string prefixed to the userId for channel naming
//                  (e.g. 'lgt-games', 'tc-games', 'trophy-hunter-games')
// tableName      — the Supabase table to watch for UPDATE events
//
// Channel names are scoped to this Supabase project — not visible to other
// projects or users. The userId suffix prevents cross-user event delivery within
// the same project; RLS on each table is the authoritative access control boundary.
// Predictable channel names are not a security concern under this model.

export function createRealtimeSubscription(channelPrefix, tableName) {
    let _channel = null;

    function subscribe(userId, onUpdate) {
        unsubscribe();
        _channel = supabase
            .channel(channelPrefix + '-' + userId)
            .on(
                'postgres_changes',
                {event: 'UPDATE', schema: 'public', table: tableName, filter: `user_id=eq.${userId}`},
                payload => onUpdate({type: 'update', row: payload.new}),
            )
            .on(
                'postgres_changes',
                {event: 'DELETE', schema: 'public', table: tableName, filter: `user_id=eq.${userId}`},
                payload => onUpdate({type: 'delete', row: payload.old}),
            )
            .subscribe();
    }

    function unsubscribe() {
        if (_channel) {
            supabase.removeChannel(_channel);
            _channel = null;
        }
    }

    return {subscribe, unsubscribe};
}
