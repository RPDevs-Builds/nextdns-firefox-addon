/**
 * DNS Forge - Content Script Injections
 */

export function injectPageButtons(domSelectors, webGuiConfig) {
    if (!domSelectors) return;
    const containers = document.querySelectorAll(domSelectors.tlds.container);
    containers.forEach(container => {
        if (container.querySelector('#nxm-tld-controls')) return;
        
        const div = document.createElement('div');
        div.id = 'nxm-tld-controls';
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <div class="flex-between" style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px;">
                <span style="font-weight: 600; font-size: 0.9em;">TLD Bulk Actions</span>
                <div style="display: flex; gap: 8px;">
                    <button id="nxm-btn-allow-all" class="btn btn-sm btn-allow">Allow All</button>
                    <button id="nxm-btn-deny-all" class="btn btn-sm btn-deny">Deny All</button>
                </div>
            </div>
        `;
        container.prepend(div);
        
        div.querySelector('#nxm-btn-allow-all').onclick = () => window.postMessage({ type: 'NXM_BULK_TLD', action: 'allow' }, '*');
        div.querySelector('#nxm-btn-deny-all').onclick = () => window.postMessage({ type: 'NXM_BULK_TLD', action: 'deny' }, '*');
    });
}

// ... more injections can be added here
