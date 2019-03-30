import { RedisClient, Multi } from 'redis';
import { Common } from '../classes/common';
import { IStore } from '..';
import {IBucket} from "../types";

function noop(){}

/**
 * {@inheritDoc}
 * @description Redis store.
 */
export class RedisStore extends Common implements IStore {
  private redis: RedisClient;
  private transaction: Multi;

  constructor(redis: RedisClient, prefix?: string) {
    super();
    this.redis = redis;
    this.prefix = prefix || 'acl';
  }

  /**
   Begins a transaction
   */
  public begin(): Multi {
    return this.redis.multi();
  }

  /**
   Ends a transaction (and executes it)
   */
  public async end(): Promise<void> {
    this.transaction.exec();
  }

  /**
   Cleans the whole storage.
   */
  public async clean(): Promise<void> {
    this.redis.keys(`${this.prefix}*`, (_err, keys: string[]) => {
      if(keys.length){
        this.redis.del(keys);
      }
    });
  }

  /**
   Gets the contents at the bucket's key.
   */
  public async get(bucket: IBucket, key): Promise<string[]> {
    // contract(arguments)
    //   .params('string', 'string|number', 'function')
    //   .end();

    const keyParam = this.bucketKey(bucket, key);

    this.redis.smembers(keyParam);
  }

  /**
   Gets an object mapping each passed bucket to the union of the specified keys inside that bucket.
   */
  public async unions(buckets, keys, cb) {
    const redisKeys = {};
    const batch = this.redis.batch();
    const self = this;

    buckets.forEach(bucket => {
      redisKeys[bucket] = self.bucketKey(bucket, keys);
      batch.sunion(redisKeys[bucket], noop);
    });

    batch.exec((err, replies) => {
      if (!Array.isArray(replies)) {
        return {};
      }

      const result = {};
      replies.forEach((reply, index) => {
        if (reply instanceof Error) {
          throw reply;
        }

        result[buckets[index]] = reply;
      });
      cb(err, result);
    });
  }

  /**
   Returns the union of the values in the given keys.
   */
  public async union(bucket, keys) {
    // contract(arguments)
    //   .params('string', 'array', 'function')
    //   .end();
    //
    keys = this.bucketKey(bucket, keys);
    this.redis.sunion(keys);
  }

  /**
   Adds values to a given key inside a bucket.
   */
  public add(bucket, key, values) {
    // contract(arguments)
    //   .params('object', 'string', 'string|number','string|array|number')
    //   .end();
    //
    key = this.bucketKey(bucket, key);

    if (Array.isArray(values)){
      values.forEach(value => {
        this.transaction.sadd(key, value);
      });
    }else{
      this.transaction.sadd(key, values);
    }
  }

  /**
   Delete the given key(s) at the bucket
   */
  public async del(bucket, keys) {
    // contract(arguments)
    //   .params('object', 'string', 'string|array')
    //   .end();
    //
    const self = this;

    keys = Array.isArray(keys) ? keys : [keys];

    keys = keys.map(key => self.bucketKey(bucket, key));

    this.transaction.del(keys);
  }

  /**
   Removes values from a given key inside a bucket.
   */
  public async remove(bucket, key, values) {
    key = this.bucketKey(bucket, key);

    if (Array.isArray(values)){
      values.forEach(value => {
        this.transaction.srem(key, value);
      }, this);
    }else{
      this.transaction.srem(key, values);
    }
  }

  private bucketKey(bucket, keys) {
    if(Array.isArray(keys)){
      return keys.map((key) => `${this.prefix}_${bucket}@${key}`, this);
    }

    return `${this.prefix}_${bucket}@${keys}`;
  }
}
