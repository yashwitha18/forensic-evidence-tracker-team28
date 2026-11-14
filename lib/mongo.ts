// lib/mongo.ts
// Owner: Yashwitha
// MongoDB client for evidence_metadata. Reads MONGODB_URI from the environment.
// The client is cached on globalThis so Next.js dev hot-reloads don't open
// a new connection on every change.

import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Add it to .env.local.");
}

const globalForMongo = globalThis as unknown as {
  _mongoClient?: MongoClient;
  _mongoDb?: Db;
};

const client = globalForMongo._mongoClient ?? new MongoClient(uri);
if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClient = client;
}

export const mongoClient = client;

export async function getMongoDb(): Promise<Db> {
  if (!globalForMongo._mongoDb) {
    await client.connect();
    globalForMongo._mongoDb = client.db(); // database name comes from the URI
  }
  return globalForMongo._mongoDb;
}

export const EVIDENCE_METADATA = "evidence_metadata";