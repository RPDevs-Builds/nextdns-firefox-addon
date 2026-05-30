/**
 * DNS Forge - Background Scheduler
 */

import { storage } from '../storage.js';
import { messageHandlers } from './handlers.js';

export async function checkAutomationRules() {
    const forgeRules = await storage.get("forgeRules", []);
    if (forgeRules.length === 0) return;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const rule of forgeRules) {
        if (!rule.active) continue;

        if (rule.trigger === currentTime) {
            console.log(`[Scheduler] Rule matched: ${rule.name} (${rule.action} ${rule.targetId})`);
            const activeProfile = await storage.get("activeProfile");
            if (!activeProfile) continue;

            await messageHandlers.TOGGLE_SETTING({
                profileId: activeProfile,
                category: rule.category,
                id: rule.targetId,
                action: rule.action === 'enable' ? 'add' : 'delete',
                settingType: rule.settingType || 'id'
            });
        }
    }
}
