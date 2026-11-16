-- RNF-15 / RF-33: PostgreSQL impide dos reservas que se enciman en el mismo recurso
-- cuando están apartadas (hold) o confirmadas. Las pendientes no bloquean (RF-27).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('hold', 'confirmed'));
