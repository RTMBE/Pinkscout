/**
 * =============================================================================
 * TEAM SHARING SERVICE
 * =============================================================================
 *
 * Manages multi-team data linking:
 * - Send/receive sharing invites
 * - Accept/reject invites
 * - Manage permission levels
 * - Query shared team data
 *
 * Permission Levels:
 * - viewer: Can view scouting data (read-only)
 * - editor: Can view and add scouting data
 * - admin: Full access to scouting data
 *
 * =============================================================================
 */

import { supabase } from './supabase';

/**
 * Permission levels for team sharing
 */
export const PERMISSION_LEVELS = {
  viewer: { label: 'Viewer', description: 'Can view scouting data', icon: '👁️' },
  editor: { label: 'Editor', description: 'Can view and add data', icon: '✏️' },
  admin: { label: 'Admin', description: 'Full access', icon: '👑' }
};

/**
 * Send a sharing invite to another team lead
 * @param {string} ownerUid - UID of the team lead sending the invite
 * @param {string} recipientEmail - Email of the team lead to invite
 * @param {string} permissionLevel - Permission level (viewer, editor, admin)
 * @returns {Promise<Object>} Result with success/error
 */
export async function sendSharingInvite(ownerUid, recipientEmail, permissionLevel = 'viewer') {
  try {
    // First, find the recipient's profile by email
    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, team_number, role')
      .eq('email', recipientEmail.toLowerCase())
      .single();

    if (profileError || !recipientProfile) {
      return { success: false, error: 'User not found with that email address' };
    }

    // Check if recipient is a team lead
    if (recipientProfile.role !== 'Team Lead' && recipientProfile.role !== 'Master Admin') {
      return { success: false, error: 'User must be a Team Lead to receive sharing invites' };
    }

    // Check if already sharing with this user
    const { data: existing } = await supabase
      .from('team_sharing')
      .select('id, status')
      .eq('owner_team_lead_uid', ownerUid)
      .eq('shared_with_team_lead_uid', recipientProfile.id)
      .single();

    if (existing) {
      if (existing.status === 'accepted') {
        return { success: false, error: 'Already sharing with this team lead' };
      } else if (existing.status === 'pending') {
        return { success: false, error: 'Invite already pending' };
      }
      // If rejected, allow re-inviting by updating the existing record
      const { error: updateError } = await supabase
        .from('team_sharing')
        .update({ status: 'pending', permission_level: permissionLevel })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      return { success: true, data: { ...existing, status: 'pending' } };
    }

    // Create new invite
    const { data, error } = await supabase
      .from('team_sharing')
      .insert({
        owner_team_lead_uid: ownerUid,
        shared_with_team_lead_uid: recipientProfile.id,
        permission_level: permissionLevel,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error sending sharing invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get outgoing invites (invites sent by the user)
 * @param {string} ownerUid - UID of the team lead
 * @returns {Promise<Array>} List of outgoing invites with recipient info
 */
export async function getOutgoingInvites(ownerUid) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .select(`
        id,
        permission_level,
        status,
        created_at,
        updated_at,
        shared_with_team_lead_uid
      `)
      .eq('owner_team_lead_uid', ownerUid)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch recipient profiles
    const recipientIds = data.map(invite => invite.shared_with_team_lead_uid);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, team_number, email')
      .in('id', recipientIds);

    const profileMap = {};
    profiles?.forEach(p => { profileMap[p.id] = p; });

    return data.map(invite => ({
      ...invite,
      recipient: profileMap[invite.shared_with_team_lead_uid] || null
    }));
  } catch (error) {
    console.error('Error getting outgoing invites:', error);
    return [];
  }
}

/**
 * Get incoming invites (invites received by the user)
 * @param {string} recipientUid - UID of the team lead
 * @returns {Promise<Array>} List of incoming invites with owner info
 */
export async function getIncomingInvites(recipientUid) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .select(`
        id,
        permission_level,
        status,
        created_at,
        updated_at,
        owner_team_lead_uid
      `)
      .eq('shared_with_team_lead_uid', recipientUid)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch owner profiles
    const ownerIds = data.map(invite => invite.owner_team_lead_uid);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, team_number, email')
      .in('id', ownerIds);

    const profileMap = {};
    profiles?.forEach(p => { profileMap[p.id] = p; });

    return data.map(invite => ({
      ...invite,
      owner: profileMap[invite.owner_team_lead_uid] || null
    }));
  } catch (error) {
    console.error('Error getting incoming invites:', error);
    return [];
  }
}

/**
 * Accept a sharing invite
 * @param {string} inviteId - UUID of the invite
 * @returns {Promise<Object>} Result with success/error
 */
export async function acceptInvite(inviteId) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .update({ status: 'accepted' })
      .eq('id', inviteId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error accepting invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reject a sharing invite
 * @param {string} inviteId - UUID of the invite
 * @returns {Promise<Object>} Result with success/error
 */
export async function rejectInvite(inviteId) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .update({ status: 'rejected' })
      .eq('id', inviteId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error rejecting invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revoke sharing access (delete the sharing record)
 * @param {string} inviteId - UUID of the invite
 * @returns {Promise<Object>} Result with success/error
 */
export async function revokeAccess(inviteId) {
  try {
    const { error } = await supabase
      .from('team_sharing')
      .delete()
      .eq('id', inviteId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error revoking access:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update permission level for existing sharing
 * @param {string} inviteId - UUID of the invite
 * @param {string} newLevel - New permission level
 * @returns {Promise<Object>} Result with success/error
 */
export async function updatePermissionLevel(inviteId, newLevel) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .update({ permission_level: newLevel })
      .eq('id', inviteId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating permission level:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all teams sharing data with the user (accepted invites where user is recipient)
 * @param {string} teamLeadUid - UID of the team lead
 * @returns {Promise<Array>} List of teams sharing with this user
 */
export async function getTeamsSharingWithMe(teamLeadUid) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .select(`
        id,
        permission_level,
        created_at,
        owner_team_lead_uid
      `)
      .eq('shared_with_team_lead_uid', teamLeadUid)
      .eq('status', 'accepted');

    if (error) throw error;

    // Fetch owner profiles
    const ownerIds = data.map(s => s.owner_team_lead_uid);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, team_number')
      .in('id', ownerIds);

    const profileMap = {};
    profiles?.forEach(p => { profileMap[p.id] = p; });

    return data.map(share => ({
      ...share,
      owner: profileMap[share.owner_team_lead_uid] || null
    }));
  } catch (error) {
    console.error('Error getting teams sharing with me:', error);
    return [];
  }
}

/**
 * Get all teams the user is sharing data with (accepted invites where user is owner)
 * @param {string} teamLeadUid - UID of the team lead
 * @returns {Promise<Array>} List of teams user is sharing with
 */
export async function getTeamsImSharingWith(teamLeadUid) {
  try {
    const { data, error } = await supabase
      .from('team_sharing')
      .select(`
        id,
        permission_level,
        created_at,
        shared_with_team_lead_uid
      `)
      .eq('owner_team_lead_uid', teamLeadUid)
      .eq('status', 'accepted');

    if (error) throw error;

    // Fetch recipient profiles
    const recipientIds = data.map(s => s.shared_with_team_lead_uid);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, team_number')
      .in('id', recipientIds);

    const profileMap = {};
    profiles?.forEach(p => { profileMap[p.id] = p; });

    return data.map(share => ({
      ...share,
      recipient: profileMap[share.shared_with_team_lead_uid] || null
    }));
  } catch (error) {
    console.error('Error getting teams I\'m sharing with:', error);
    return [];
  }
}

