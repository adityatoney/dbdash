"""Normalize hotel name strings."""

import math


def normalize_hotel_name(value):
    """
    Normalize a hotel name by stripping whitespace and applying title case.

    Handles case inconsistencies like "HYATT REGENCY ORLANDO" vs "Hyatt Regency Orlando".

    Args:
        value: Raw hotel name string.

    Returns:
        str or None: Normalized hotel name, or None if input is empty/None/NaN.
    """
    if value is None:
        return None

    if isinstance(value, float) and math.isnan(value):
        return None

    if not isinstance(value, str):
        value = str(value)

    cleaned = value.strip()
    if not cleaned:
        return None

    # Apply title case to normalize casing inconsistencies
    normalized = cleaned.title()

    # Fix common title-case artifacts for hotel names
    # e.g., "Hyatt Regency At The" -> keep as-is (title case handles it)
    # Fix articles/prepositions that title() capitalizes but shouldn't matter
    # for uniqueness since we use this as the canonical name
    replacements = {
        "'S": "'s",
        " Of ": " of ",
        " The ": " the ",
        " At ": " at ",
        " By ": " by ",
        " And ": " and ",
        " In ": " in ",
        " On ": " on ",
        " A ": " a ",
        " An ": " an ",
    }

    for old, new in replacements.items():
        normalized = normalized.replace(old, new)

    # Ensure first character is still uppercase after replacements
    if normalized:
        normalized = normalized[0].upper() + normalized[1:]

    return normalized
