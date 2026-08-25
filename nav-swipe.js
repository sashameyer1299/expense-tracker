// Swipe left/right to move between the app's pages. Plain touch events, no libraries.
// Shared across all four pages via a single <script> include.

const PAGE_ORDER = ['overview.html', 'index.html', 'budget.html', 'health.html', 'income.html', 'debts.html'];
const SWIPE_THRESHOLD = 70;

function currentPageIndex() {
  const path = location.pathname.split('/').pop() || 'index.html';
  const idx = PAGE_ORDER.indexOf(path);
  return idx === -1 ? 0 : idx;
}

let touchStartX = null;
let touchStartY = null;

document.addEventListener(
  'touchstart',
  (e) => {
    // Skip — the category list has its own touch handling (drag to reorder) and shouldn't
    // also trigger a page swipe.
    if (e.target.closest('.categoryList')) {
      touchStartX = null;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);

document.addEventListener(
  'touchend',
  (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const idx = currentPageIndex();
    if (dx < 0 && idx < PAGE_ORDER.length - 1) {
      location.href = PAGE_ORDER[idx + 1];
    } else if (dx > 0 && idx > 0) {
      location.href = PAGE_ORDER[idx - 1];
    }
  },
  { passive: true }
);
