{% if author %}
**Author:** {{author}}
{% endif %}

{% if url %}
**URL:** [{{title}}]({{url}})
{% endif %}

{% if chapter %}
**Chapter:** {{chapter}}
{% endif %}

{% if page %}
**Page:** {{page}}
{% endif %}

**Date:** {{created_at | date("YYYY-MM-DD")}}

---

> {{content}}

{%- if note %}
**Note:** {{note}}
{% endif %}

{%- if tags %}
{% for tag in tags %}{{tag.name}}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif %}

---
*Synced from Screvi*