import os
import re
import time
import redis
from app.core.config import settings


class InMemoryPipeline:
    def __init__(self, store):
        self.store = store
        self.ops = []

    def zadd(self, key, mapping):
        def _op():
            z = self.store.setdefault(key, {})
            if isinstance(z, dict):
                z.update(mapping)
            return len(mapping)
        self.ops.append(_op)
        return self

    def zremrangebyscore(self, key, min_val, max_val):
        def _op():
            z = self.store.get(key, {})
            removed = 0
            if isinstance(z, dict):
                for k, v in list(z.items()):
                    if min_val <= v <= max_val:
                        del z[k]
                        removed += 1
            return removed
        self.ops.append(_op)
        return self

    def zcard(self, key):
        def _op():
            z = self.store.get(key, {})
            return len(z) if isinstance(z, dict) else 0
        self.ops.append(_op)
        return self

    def incr(self, key):
        def _op():
            val = int(self.store.get(key, 0)) + 1
            self.store[key] = val
            return val
        self.ops.append(_op)
        return self

    def expire(self, key, seconds):
        def _op():
            return 1
        self.ops.append(_op)
        return self

    def execute(self):
        results = [op() for op in self.ops]
        self.ops = []
        return results


class InMemoryRedis:
    def __init__(self):
        self._store = {}
        self._expiries = {}

    def get(self, key):
        if key in self._expiries and time.time() > self._expiries[key]:
            self._store.pop(key, None)
            self._expiries.pop(key, None)
            return None
        return self._store.get(key)

    def set(self, key, value, ex=None):
        self._store[key] = str(value)
        if ex:
            self._expiries[key] = time.time() + ex
        return True

    def setex(self, key, time_sec, value):
        return self.set(key, value, ex=time_sec)

    def delete(self, *keys):
        count = 0
        for k in keys:
            if self._store.pop(k, None) is not None:
                count += 1
            self._expiries.pop(k, None)
        return count

    def incr(self, key):
        val = int(self._store.get(key, 0)) + 1
        self._store[key] = val
        return val

    def expire(self, key, seconds):
        if key in self._store:
            self._expiries[key] = time.time() + seconds
            return 1
        return 0

    def ttl(self, key):
        if key in self._expiries:
            remaining = int(self._expiries[key] - time.time())
            return max(0, remaining)
        return -1 if key in self._store else -2

    def keys(self, pattern="*"):
        regex = re.compile("^" + pattern.replace("*", ".*") + "$")
        return [k for k in self._store.keys() if regex.match(k)]

    def pipeline(self):
        return InMemoryPipeline(self._store)

    def ping(self):
        return True

    def publish(self, channel, message):
        return 0


def _init_redis():
    # If explicitly in testing or offline, or if real Redis cannot be reached quickly:
    host = "127.0.0.1" if settings.redis_host == "localhost" else settings.redis_host
    try:
        real_client = redis.Redis(
            host=host,
            port=settings.redis_port,
            password=settings.redis_password,
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
        )
        real_client.ping()
        return real_client
    except Exception:
        return InMemoryRedis()


redis_client = _init_redis()
