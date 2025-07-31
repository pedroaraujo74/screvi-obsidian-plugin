**Author:** {{author}}
{% if url %}**URL:** [{{title}}]({{url}}){% endif %}

## Highlights

{% for highlight in highlights %}
> {{highlight.content}}
{%- if highlight.note %}

**Note:** {{highlight.note}}
{%- endif %}
{%- if highlight.chapter %}
**Chapter:** {{highlight.chapter}}
{%- endif %}
{%- if highlight.page %}
**Page:** {{highlight.page}}
{%- endif %}
{%- if highlight.tags %}
{% for tag in highlight.tags %}#{{tag.name}}{% if not loop.last %}, {% endif %}{% endfor %}
{%- endif %}

---
{% endfor %}