import { NextResponse } from "next/server";
import {
  deleteCustomMapById,
  getCustomMapById,
  listCustomMaps,
  upsertCustomMap,
} from "../../../server/db";
import { CustomMapDocumentSchema } from "../../../shared/schemas/map-editor";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const map = getCustomMapById(id);
      if (!map) {
        return NextResponse.json(
          { error: `Carte '${id}' introuvable.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ map });
    }

    const maps = listCustomMaps(60);
    return NextResponse.json({ maps });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lecture des cartes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody = (await request.json()) as unknown;
    const parsed = CustomMapDocumentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Schéma de carte invalide.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const saved = upsertCustomMap(parsed.data);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur sauvegarde de la carte." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Paramètre 'id' requis." },
        { status: 400 }
      );
    }
    const deleted = deleteCustomMapById(id);
    return NextResponse.json({ deleted, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur suppression." },
      { status: 500 }
    );
  }
}
