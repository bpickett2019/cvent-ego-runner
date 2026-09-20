import { isApprovedEventNavigation } from '../ego-bridge/host.mjs';
import { eventObservationProgram } from './browser-identity.mjs';

// Only the unique API-confirmed UUID supplies this documented Cvent route.
// The browser must be at the neutral Events list or already in that event.
export function eventLocationPlan(runtime, observed) {
  const id = runtime.apiEvent?.id;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '') ||
      runtime.apiEvent?.name !== runtime.expectedEventName) throw new Error('A unique API-confirmed event is required');
  if (runtime.expectedEvtstub && runtime.expectedEvtstub !== id) throw new Error('Selected event identity changed; stop');
  const destination = `https://app.cvent.com/Subscribers/Events2/Details/EventDetails/Index?evtstub=${id}`;
  const scoped = { ...runtime, expectedEvtstub: id };
  if (/sign in|log in|password|verification code|logged out due to inactivity/i.test(observed.snapshot || '')) {
    throw new Error('Complete human login, then Return to Agent; no event navigation is required from you');
  }
  if (!isApprovedEventNavigation(scoped, observed.info?.url, destination)) {
    throw new Error('Browser is at another event, login page or an ambiguous location; stopped without switching events');
  }
  return { id, name: runtime.expectedEventName, destination };
}

export function eventLocationProgram(plan) {
  return `const task = await taskSpace('cvent-ego-runner');
    const inventory = await task.tabs();
    const active = inventory.find(tab => tab.active);
    if (inventory.length !== 1 || !active) throw new Error('Assigned page is ambiguous');
    const page = active.label ? task.page(active.label) : await task.adopt(active.page);
    await page.goto(${JSON.stringify(plan.destination)});
    await page.waitForURL(${JSON.stringify(plan.destination)}, {timeout:10000});
    await page.waitForFunction(() => !!document.querySelector('#EventInputModel_Title-container .cv-value, #EventInputModel_Title'), undefined, {timeout:10000});
    ${eventObservationProgram()}`;
}
