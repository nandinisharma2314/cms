"""Free-text search filters."""
from sqlalchemy import or_


def text_match(term: str, *columns):
    """Case-insensitive substring match on any of `columns`. `%` and `_` in the
    term are matched literally, not as wildcards."""
    return or_(*(column.icontains(term, autoescape=True) for column in columns))
