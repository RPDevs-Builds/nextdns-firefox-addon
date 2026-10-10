/**
 * DNS Forge - Background Scheduler
 * @module background/scheduler
 */

import { storage } from '../storage.js';
import { messageHandlers } from './handlers.js';

/**
 * Periodically checks the stored automation rules against the current time.
 * If a rule's trigger matches the current HH:mm, the rule's action is executed.
 * Rules typically toggle settings or blocklists.
 * @async
 */
export async function checkAutomationRules() {
    const forgeRules = await storage.get("forgeRules", []);
    if (forgeRules.length === 0) return;

    const now = new Date();
    const currentHours = now.getHours();
    const currentMins = now.getMinutes();
    const currentTotalMins = currentHours * 60 + currentMins;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let rulesChanged = false;

    for (const rule of forgeRules) {
        if (!rule || !rule.active || typeof rule.trigger !== 'string') continue;
        if (!rule.targetId || !['enable', 'disable'].includes(rule.action)) continue;

        const parts = rule.trigger.split(':');
        if (parts.length !== 2) continue;
        const [tHours, tMins] = parts.map(Number);
        if (isNaN(tHours) || isNaN(tMins) || tHours < 0 || tHours > 23 || tMins < 0 || tMins > 59) continue;
        const triggerTotalMins = tHours * 60 + tMins;

        // Check if current time is within a 2-minute catch-up window of trigger, and not yet executed today
        const diff = currentTotalMins - triggerTotalMins;
        const isDue = (diff >= 0 && diff <= 2) && (rule.lastRunDate !== todayStr);

        if (isDue) {
            console.log(`[Scheduler] Rule matched: ${rule.name} (${rule.action} ${rule.targetId})`);
            rule.lastRunDate = todayStr;
            rulesChanged = true;

            const activeProfile = await storage.get("activeProfile");
            if (!activeProfile) continue;

            const isService = (rule.category || '').toLowerCase().includes('services');
            const settingType = rule.settingType || (isService ? 'list' : 'boolean');

            await messageHandlers.TOGGLE_SETTING({
                profileId: activeProfile,
                category: rule.category,
                id: rule.targetId,
                action: rule.action === 'enable' ? 'add' : 'delete',
                settingType
            }).catch(err => console.error(`[Scheduler] Failed to execute rule ${rule.name}:`, err));
        }
    }

    if (rulesChanged) {
        await storage.set("forgeRules", forgeRules);
    }
}
