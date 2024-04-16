import { Redis } from '@upstash/redis'

const redis = new Redis({
    url: 'https://us1-discrete-lark-42524.upstash.io',
    token: 'AaYcASQgYmQxMDczYTctMmYyNy00NTA4LTk5MTEtMzI4YmViYTdjMzc2M2FhY2RmYWNhMDVlNDNjYmI2Y2NkNDM2NmJjZjA5YTY=',
})

export const setData = async (key, value, duration = null) => {
    if (duration) {
        redis.set(key, value, { ex: duration })
    }
    await redis.set(key, value)
}

export const getData = async (key) => {
    try {
        return redis.get(key);
    } catch (error) {
        return null;
    }
}

