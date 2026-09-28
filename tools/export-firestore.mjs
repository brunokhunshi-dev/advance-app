import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";

const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const structureOnly = args.includes("--structure-only");
const output = getArg("--output") || `exports/firestore-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const collectionsArg = getArg("--collections");
const selectedCollections = collectionsArg
  ? collectionsArg.split(",").map((value) => value.trim()).filter(Boolean)
  : null;

function serializeValue(value) {
  if (value instanceof Timestamp) {
    return { _type: "timestamp", value: value.toDate().toISOString() };
  }

  if (value instanceof GeoPoint) {
    return { _type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }

  if (value instanceof DocumentReference) {
    return { _type: "reference", path: value.path };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)])
    );
  }

  return value;
}

function describeType(value) {
  if (value instanceof Timestamp) return "timestamp";
  if (value instanceof GeoPoint) return "geopoint";
  if (value instanceof DocumentReference) return "reference";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function addFieldStats(stats, data) {
  for (const [field, value] of Object.entries(data)) {
    const entry = stats[field] || { types: {}, occurrences: 0 };
    const type = describeType(value);
    entry.types[type] = (entry.types[type] || 0) + 1;
    entry.occurrences += 1;
    stats[field] = entry;
  }
}

async function exportCollection(collectionRef, includeValues = true) {
  const snapshot = await collectionRef.get();
  const documents = [];
  const fieldStats = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    addFieldStats(fieldStats, data);

    const item = {
      id: doc.id,
      path: doc.ref.path,
      fields: includeValues ? serializeValue(data) : undefined,
    };

    if (!includeValues) delete item.fields;

    const subcollections = await doc.ref.listCollections();
    item.subcollections = [];

    for (const subcollection of subcollections) {
      item.subcollections.push(
        await exportCollection(subcollection, includeValues)
      );
    }

    documents.push(item);
  }

  return {
    path: collectionRef.path,
    documentCount: snapshot.size,
    fields: fieldStats,
    documents,
  };
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account do Firebase."
    );
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
    });
  }

  const db = getFirestore();
  const rootCollections = await db.listCollections();

  const collections = selectedCollections
    ? rootCollections.filter((collection) =>
        selectedCollections.includes(collection.id)
      )
    : rootCollections;

  const result = {
    exportedAt: new Date().toISOString(),
    mode: structureOnly ? "structure-only" : "full",
    collections: [],
  };

  for (const collection of collections) {
    console.log(`Exportando ${collection.path}...`);
    result.collections.push(
      await exportCollection(collection, !structureOnly)
    );
  }

  const outputPath = path.resolve(output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");

  console.log(`Exportacao concluida: ${outputPath}`);
}

main().catch((error) => {
  console.error("Falha na exportacao:", error);
  process.exit(1);
});
