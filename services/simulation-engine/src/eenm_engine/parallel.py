"""One lock for every call into a Numba ``parallel=True`` kernel.

Numba's default threading layer (workqueue) is not thread-safe: two simulations streamed at the same time (FastAPI
iterates each stream in its own worker thread) entering parallel kernels together abort the whole process
("Concurrent access has been detected"). Each kernel call is short (one block of samples), so serialising the calls
lets concurrent simulations interleave safely.
"""

from __future__ import annotations

import threading

NUMBA_PARALLEL_LOCK = threading.Lock()
