"""Mobile numbers, following the organisation's phone settings.

Numbers are stored as the national number (the digits after the country
code). Input may include the country code, spaces, dashes or brackets; any
other shape (wrong length, a trunk prefix, a foreign country code) is
rejected rather than trimmed to fit.
"""
from sqlalchemy.orm import Session

from services import settings_service


class PhoneFormat:
    def __init__(self, country_code: str, number_length: int, expected_prefixes: str | None):
        self.country_code = country_code
        self.country_digits = country_code.lstrip("+")
        self.number_length = number_length
        self.expected_prefixes = expected_prefixes or ""

    def normalize(self, raw: str | None) -> str | None:
        """The national number, or None when `raw` is not a valid number."""
        if raw is None:
            return None
        text = raw.strip()
        if not text:
            return None
        allowed = set("0123456789+-() .")
        if any(ch not in allowed for ch in text):
            return None
        digits = "".join(ch for ch in text if ch.isdigit())
        with_cc = self.country_digits + "0" * self.number_length
        if text.startswith("+") or text.startswith("00"):
            digits = digits[2:] if text.startswith("00") else digits
            if not digits.startswith(self.country_digits) or len(digits) != len(with_cc):
                return None
            digits = digits[len(self.country_digits):]
        elif len(digits) == len(with_cc) and digits.startswith(self.country_digits):
            digits = digits[len(self.country_digits):]
        if len(digits) != self.number_length:
            return None
        return digits

    def international(self, national: str) -> str:
        return f"{self.country_code}{national}"

    def looks_unusual(self, national: str) -> bool:
        """True when expected leading digits are configured and the number starts differently."""
        return bool(self.expected_prefixes) and national[0] not in self.expected_prefixes

    def describe(self) -> str:
        return f"a {self.number_length}-digit number (optionally with {self.country_code} in front)"


def phone_format(db: Session) -> PhoneFormat:
    settings = settings_service.get_settings(db)
    return PhoneFormat(
        settings_service.require(db, "phone_country_code"),
        settings_service.require(db, "phone_number_length"),
        settings.phone_expected_prefixes,
    )
