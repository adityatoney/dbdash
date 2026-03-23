-- CreateTable
CREATE TABLE "members" (
    "member_id" INTEGER NOT NULL,
    "family_id" INTEGER NOT NULL,
    "mahatma_id" INTEGER,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "gender" CHAR(1),
    "birth_month" INTEGER,
    "birth_year" INTEGER,
    "phone_primary" TEXT,
    "phone_secondary" TEXT,
    "email" TEXT,
    "photo_filename" TEXT,
    "in_mms" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "families" (
    "family_id" INTEGER NOT NULL,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "families_pkey" PRIMARY KEY ("family_id")
);

-- CreateTable
CREATE TABLE "events" (
    "event_id" INTEGER NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_type_id" INTEGER NOT NULL,
    "zone_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_gp_event" BOOLEAN NOT NULL DEFAULT false,
    "is_virtual" BOOLEAN NOT NULL DEFAULT false,
    "has_gnanvidhi" BOOLEAN NOT NULL DEFAULT false,
    "target_demographic" TEXT,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_types" (
    "event_type_id" SERIAL NOT NULL,
    "type_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("event_type_id")
);

-- CreateTable
CREATE TABLE "zones" (
    "zone_id" SERIAL NOT NULL,
    "zone_name" TEXT NOT NULL,
    "states_included" TEXT NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("zone_id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "hotel_id" SERIAL NOT NULL,
    "hotel_name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("hotel_id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "room_type_id" SERIAL NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("room_type_id")
);

-- CreateTable
CREATE TABLE "room_type_aliases" (
    "alias_id" SERIAL NOT NULL,
    "room_type_id" INTEGER NOT NULL,
    "raw_name" TEXT NOT NULL,

    CONSTRAINT "room_type_aliases_pkey" PRIMARY KEY ("alias_id")
);

-- CreateTable
CREATE TABLE "event_attendance" (
    "attendance_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_time_utc" TIMESTAMP(3),
    "age_at_event" INTEGER,
    "gnan_taken" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "room_bookings" (
    "booking_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "hotel_id" INTEGER,
    "room_type_id" INTEGER,
    "family_id" INTEGER NOT NULL,
    "room_booked" BOOLEAN NOT NULL DEFAULT false,
    "stayed_in_room" BOOLEAN NOT NULL DEFAULT false,
    "occupants" INTEGER NOT NULL DEFAULT 0,
    "rooms_per_family" INTEGER NOT NULL DEFAULT 0,
    "check_in_date" TIMESTAMP(3),
    "check_out_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "gnan_records" (
    "gnan_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "mahatma_id" INTEGER,
    "gnan_date" TIMESTAMP(3),
    "event_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gnan_records_pkey" PRIMARY KEY ("gnan_id")
);

-- CreateTable
CREATE TABLE "member_addresses" (
    "address_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipcode" TEXT,
    "country" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_addresses_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "hotel_room_inventory" (
    "inventory_id" SERIAL NOT NULL,
    "hotel_id" INTEGER NOT NULL,
    "room_type_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "inventory_date" TIMESTAMP(3) NOT NULL,
    "rooms_reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_room_inventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable
CREATE TABLE "data_quality_log" (
    "log_id" SERIAL NOT NULL,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "column_name" TEXT,
    "issue_type" TEXT,
    "original_value" TEXT,
    "imputed_value" TEXT,
    "resolution" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_mahatma_id_key" ON "members"("mahatma_id");

-- CreateIndex
CREATE INDEX "members_family_id_idx" ON "members"("family_id");

-- CreateIndex
CREATE INDEX "events_year_idx" ON "events"("year");

-- CreateIndex
CREATE INDEX "events_event_type_id_idx" ON "events"("event_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_type_name_key" ON "event_types"("type_name");

-- CreateIndex
CREATE UNIQUE INDEX "zones_zone_name_key" ON "zones"("zone_name");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_hotel_name_key" ON "hotels"("hotel_name");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_canonical_name_key" ON "room_types"("canonical_name");

-- CreateIndex
CREATE UNIQUE INDEX "room_type_aliases_raw_name_key" ON "room_type_aliases"("raw_name");

-- CreateIndex
CREATE INDEX "event_attendance_member_id_idx" ON "event_attendance"("member_id");

-- CreateIndex
CREATE INDEX "event_attendance_event_id_idx" ON "event_attendance"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_attendance_member_id_event_id_key" ON "event_attendance"("member_id", "event_id");

-- CreateIndex
CREATE INDEX "room_bookings_event_id_idx" ON "room_bookings"("event_id");

-- CreateIndex
CREATE INDEX "room_bookings_hotel_id_idx" ON "room_bookings"("hotel_id");

-- CreateIndex
CREATE INDEX "gnan_records_gnan_date_idx" ON "gnan_records"("gnan_date");

-- CreateIndex
CREATE INDEX "member_addresses_member_id_is_current_idx" ON "member_addresses"("member_id", "is_current");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("family_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("event_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("zone_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_aliases" ADD CONSTRAINT "room_type_aliases_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("room_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("hotel_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("room_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("family_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gnan_records" ADD CONSTRAINT "gnan_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gnan_records" ADD CONSTRAINT "gnan_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_addresses" ADD CONSTRAINT "member_addresses_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_inventory" ADD CONSTRAINT "hotel_room_inventory_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("hotel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_inventory" ADD CONSTRAINT "hotel_room_inventory_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("room_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_inventory" ADD CONSTRAINT "hotel_room_inventory_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
