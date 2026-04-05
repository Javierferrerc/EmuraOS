import koffi from "koffi";

// ── Lazy-loaded user32.dll ──
let _user32: koffi.IKoffiLib | null = null;

function user32(): koffi.IKoffiLib {
  if (!_user32) {
    _user32 = koffi.load("user32.dll");
  }
  return _user32;
}

// ── Lazy-loaded gdi32.dll (only needed for GDI regions) ──
let _gdi32: koffi.IKoffiLib | null = null;

function gdi32(): koffi.IKoffiLib {
  if (!_gdi32) {
    _gdi32 = koffi.load("gdi32.dll");
  }
  return _gdi32;
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
const SWP_NOACTIVATE = 0x0010;

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
const GetAsyncKeyState = memoize(() =>
  user32().func("int16 __stdcall GetAsyncKeyState(int vKey)")
);
const CreateRectRgn = memoize(() =>
  gdi32().func("void * __stdcall CreateRectRgn(int nLeftRect, int nTopRect, int nRightRect, int nBottomRect)")
);
const SetWindowRgn = memoize(() =>
  user32().func("int __stdcall SetWindowRgn(void *hWnd, void *hRgn, int bRedraw)")
);
const SetMenu = memoize(() =>
  user32().func("int __stdcall SetMenu(void *hWnd, void *hMenu)")
);
const DrawMenuBar = memoize(() =>
  user32().func("int __stdcall DrawMenuBar(void *hWnd)")
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
 * Move and resize window WITHOUT activating it.
 *
 * SWP_NOACTIVATE is critical here: the emulator-overlay sync loop calls this
 * every 100ms to track the host window. Without SWP_NOACTIVATE, each call
 * triggers WM_ACTIVATE/WM_SETFOCUS on the target window, causing constant
 * focus thrashing that interferes with Qt-based emulators' (PCSX2, Citra)
 * keyboard event delivery — the user perceives this as the game controls
 * being "frozen" even though the window is visible.
 *
 * The initial keyboard focus is given once via `focusWindow` after the
 * emulator window is first embedded; subsequent reposition calls should
 * NOT re-steal or re-assert activation.
 */
export function positionWindow(hwnd: unknown, x: number, y: number, w: number, h: number): void {
  SetWindowPos()(hwnd, 0, x, y, w, h, SWP_SHOWWINDOW | SWP_NOACTIVATE);
}

/**
 * Remove the native Win32 menu bar (HMENU) from a window.
 *
 * Win32 menus attached via SetMenu live in the non-client area but are
 * NOT part of the window styles cleared by stripDecorations — they're a
 * separate attachment. PPSSPP (Archivo / Emulación / Depuración / ...),
 * Dolphin, Project64 and other non-Qt emulators use native menus, so
 * embedding reparents the window but the menu bar still eats pixels at
 * the top of the client area.
 *
 * Passing NULL (0) to SetMenu detaches the menu; DrawMenuBar then forces
 * Windows to recalculate the non-client area so the client region grows
 * into the space the menu used to occupy. No-op for windows that have no
 * menu attached (SetMenu succeeds either way), so this is safe to call
 * unconditionally during embedding.
 */
export function removeMenuBar(hwnd: unknown): void {
  SetMenu()(hwnd, 0);
  DrawMenuBar()(hwnd);
}

/**
 * Clip off the top N pixels of a window so they are never drawn.
 *
 * Used to hide emulator menu bars and toolbars that live inside the client
 * area (Qt-based emulators like PCSX2 have a QMenuBar widget as a child of
 * the main widget, so stripping the Win32 window frame doesn't remove it).
 *
 * We create a rectangular GDI region starting at (0, pixels) and extending
 * to (99999, 99999). Windows clips the visible area of the window to this
 * region at the compositor level, so anything in the top `pixels` rows —
 * including the QMenuBar and QToolBar — is never composited on screen,
 * regardless of how large the window actually is. The caller is expected
 * to extend the window upward by the same `pixels` amount via positionWindow
 * so the remaining visible area exactly fills the intended game rectangle.
 *
 * SetWindowRgn takes ownership of the region handle on success, so we
 * don't need to DeleteObject() the rgn ourselves. The region outlives any
 * resize of the window because it's defined in window-relative coordinates
 * and its right/bottom (99999) will always exceed the actual window extents.
 */
export function clipTopPixels(hwnd: unknown, pixels: number): void {
  const rgn = CreateRectRgn()(0, pixels, 99999, 99999);
  // bRedraw=1 so the window is repainted immediately with the new region.
  SetWindowRgn()(hwnd, rgn, 1);
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

/**
 * Returns true if the given Virtual-Key is currently held down.
 *
 * Uses GetAsyncKeyState which reads the real-time keyboard state regardless
 * of which process owns the foreground window. This is a low-level fallback
 * used by the emulator overlay so keybinds like F10 keep working even when
 * a fullscreen emulator child process has hijacked the foreground and
 * Electron's `globalShortcut` (RegisterHotKey-based) stops delivering events.
 *
 * Only the "currently down" bit (0x8000) is checked — the "pressed since
 * last call" bit (0x0001) is ignored so the caller controls edge detection.
 */
export function isKeyPressed(vk: number): boolean {
  // GetAsyncKeyState returns a SHORT: high bit (0x8000) = currently down,
  // low bit (0x0001) = was pressed since last call.
  const state = Number(GetAsyncKeyState()(vk));
  return (state & 0x8000) !== 0;
}

/** Windows Virtual-Key code for F10. */
export const VK_F10 = 0x79;
