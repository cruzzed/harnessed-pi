# Django MVT: Project-Specific Rules

## 0. MVT Boundaries (Law)

| Layer | Owns | Forbidden |
|---|---|---|
| **Model** | Data integrity, `save()`, `clean()`, Managers | HTML, request handling |
| **Form** | Validation, `clean()`, field logic | DB queries (use Model methods) |
| **View** | Request/response, auth, queryset optimization | Business logic, HTML generation |
| **Template** | Presentation, HTMX attributes | DB queries, business logic |
| **URL** | Routing, `app_name`, named paths | Logic |

## 1. Anti-Patterns (Blocked by Protocol)

- Querying DB in templates → Use `select_related`/`prefetch_related` in View
- Business logic in View → Model method or Form `clean()`
- HTML generation in View → Pass context to Template
- `print()` debugging → Write probe script
- `shell -c` one-liners → Write `.py` probe in `probes/`
- DRF for HTMX endpoints → Standard CBV/FBV with `render()`
- Custom SQL when ORM suffices → `QuerySet.annotate()`
- Signals for business logic → Explicit method calls

## 2. HTMX Rules

- Endpoints return **rendered HTML partials**, not JSON.
- Partial templates: `myapp/_<model>_<fragment>.html` (underscore prefix).
- OOB swaps: `hx-swap-oob="true"` on secondary elements.
- View detects HTMX via `request.headers.get("HX-Request")`.

## 3. Probe Script Template

Subagents MUST produce probes following this structure:

```python
#!/usr/bin/env python
"""Probe: <Feature> - Happy Path v<N>"""
import os, sys, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.test import RequestFactory, Client
from django.contrib.auth import get_user_model
User = get_user_model()

def probe():
    results = {"probe": "...", "status": "pending", "checks": []}
    # Check 1: Model
    try:
        # instance = MyModel.objects.create(...)
        results["checks"].append({"layer": "model", "status": "pass"})
    except Exception as e:
        results["checks"].append({"layer": "model", "status": "fail", "error": str(e)})
    # Check 2: View
    # Check 3: Template
    results["status"] = "pass" if all(c["status"] == "pass" for c in results["checks"]) else "fail"
    return results

if __name__ == "__main__":
    print(json.dumps(probe(), indent=2))
```

## 4. Task Map Template

Before spawning, spec MUST contain:

```markdown
## Task Map: <Feature>

### Models (`myapp/models.py`)
- [ ] `MyModel` — fields, `Meta`, `__str__`, `get_absolute_url`

### Forms (`myapp/forms.py`)
- [ ] `MyModelForm` — `Meta: model = MyModel`, validation

### Views (`myapp/views.py`)
- [ ] `MyView` — CBV, auth, queryset optimization

### Templates (`myapp/templates/myapp/`)
- [ ] `<model>_form.html` — full page
- [ ] `_<model>_item.html` — HTMX partial

### URLs (`myapp/urls.py`)
- [ ] `path("create/", MyView.as_view(), name="myapp_create")`

### Tests & Probes
- [ ] `probes/test_<feature>_v<N>.py` — happy path
- [ ] `probes/test_<feature>_edge_<name>.py` — edge cases
```
