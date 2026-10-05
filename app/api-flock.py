"""Lock inherited fd 3. The Node caller keeps the same open-file description.

No keeper process, PID heuristic, file deletion, credentials or network. Never
LOCK_UN here: exiting closes only this child's reference; Node still owns its fd.
"""
import errno
import os
import stat
import sys

try:
    import fcntl
    if not stat.S_ISREG(os.fstat(3).st_mode):
        sys.exit(74)
    fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError as error:
    sys.exit(73 if error.errno in (errno.EACCES, errno.EAGAIN) else 74)
except (ImportError, AttributeError):
    sys.exit(74)
else:
    sys.stdout.write("API_FLOCK_V1\n")
