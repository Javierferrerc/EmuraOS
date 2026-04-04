import koffi from "koffi";

// ── Lazy-loaded user32.dll ──
let _user32: koffi.IKoffiLib | null = null;

function user32(): koffi.IKoffiLib {
  if (!_user32) {
    _user32 = koffi.load("user32.dll");
  }
  return _user32;
}

// ── Constants ──
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;

const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_BORDER = 0x00800000;
const WS_SYSMENU = 0x00080000;

const WS_EX_APPWINDOW = 0x00040000;
const WS_EX_TOOLWINDOW = 0x00000080;

const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_NOZORDER = 0x0004;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;

const SW_SHOW = 5;
const SW_HIDE = 0;

// ── Lazy function bindings ──
// Created on first use so koffi.load only runs when actually needed.

function memoize<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = factory();
    return cached;
  };
}

const IsWindow = memoize(() =>
  user32().func("int __stdcall IsWindow(void *hWnd)")
);
const MoveWindow = memoize(() =>
  user32().func("int __stdcall MoveWindow(void *hWnd, int X, int Y, int nWidth, int nHeight, int bRepaint)")
);
const ShowWindow_ = memoize(() =>
  user32().func("int __stdcall ShowWindow(void *hWnd, int nCmdShow)")
);
const SetForegroundWindow = memoize(() =>
  user32().func("int __stdcall SetForegroundWindow(void *hWnd)")
);
const GetWindowLongPtrW = memoize(() =>
  user32().func("intptr __stdcall GetWindowLongPtrW(void *hWnd, int nIndex)")
);
const SetWindowLongPtrW = memoize(() =>
  user32().func("intptr __stdcall SetWindowLongPtrW(void *hWnd, int nIndex, intptr dwNewLong)")
);
const SetWindowPos = memoize(() =>
  user32().func("int __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)")
);
const GetWindowThreadProcessId = memoize(() =>
  user32().func("uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)")
);
const IsWindowVisible = memoize(() =>
  user32().func("int __stdcall IsWindowVisible(void *hWnd)")
);
// EnumWindows proto + binding
// Proto is defined lazily on first use, before EnumWindows or register calls.
let _wndenumproc: unknown | null = null;
function wndenumproc() {
  if (!_wndenumproc) {
    _wndenumproc = koffi.proto("int __stdcall WNDENUMPROC(void *hwnd, intptr lParam)");
  }
  return _wndenumproc;
}
const EnumWindows = memoize(() => {
  wndenumproc(); // ensure proto is defined
  return user32().func("int __stdcall EnumWindows(WNDENUMPROC *lpEnumFunc, intptr lParam)");
});

/**
 * Poll for a top-level visible window owned by the given PID.
 * Tries every 200ms for up to 10 seconds.
 */
export function findWindowByPid(pid: number): Promise<unknown | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 10_000;

    // Ensure proto + EnumWindows are initialized before first attempt
    wndenumproc();
    EnumWindows();

    function attempt() {
      let found: unknown | null = null;

      const cb = koffi.register(
        (hwnd: unknown, _lParam: number) => {
          const pidOut = [null] as unknown as [number];
          GetWindowThreadProcessId()(hwnd, pidOut);
          if (pidOut[0] === pid && IsWindowVisible()(hwnd)) {
            found = hwnd;
            return 0; // stop enumeration
          }
          return 1; // continue
        },
        koffi.pointer("WNDENUMPROC")
      );

      try {
        EnumWindows()(cb, 0);
      } finally {
        koffi.unregister(cb);
      }

      if (found) {
        resolve(found);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }

      setTimeout(attempt, 200);
    }

    attempt();
  });
}

/**
 * Remove window chrome (title bar, borders, resize frame).
 */
export function stripDecorations(hwnd: unknown): void {
  let style = Number(GetWindowLongPtrW()(hwnd, GWL_STYLE));
  style &= ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_SYSMENU);
  SetWindowLongPtrW()(hwnd, GWL_STYLE, style);
  SetWindowPos()(hwnd, 0, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOMOVE | SWP_NOSIZE);
}

/**
 * Hide window from the taskbar.
 */
export function hideFromTaskbar(hwnd: unknown): void {
  let exStyle = Number(GetWindowLongPtrW()(hwnd, GWL_EXSTYLE));
  exStyle |= WS_EX_TOOLWINDOW;
  exStyle &= ~WS_EX_APPWINDOW;
  SetWindowLongPtrW()(hwnd, GWL_EXSTYLE, exStyle);
}

/**
 * Move and resize window.
 */
export function positionWindow(hwnd: unknown, x: number, y: number, w: number, h: number): void {
  SetWindowPos()(hwnd, 0, x, y, w, h, SWP_SHOWWINDOW);
}

/**
 * Show or hide window.
 */
export function showWindow(hwnd: unknown, visible: boolean): void {
  ShowWindow_()(hwnd, visible ? SW_SHOW : SW_HIDE);
}

/**
 * Bring window to foreground.
 */
export function focusWindow(hwnd: unknown): void {
  SetForegroundWindow()(hwnd);
}

/**
 * Check if the window handle is still valid.
 */
export function isWindowAlive(hwnd: unknown): boolean {
  return IsWindow()(hwnd) !== 0;
}
