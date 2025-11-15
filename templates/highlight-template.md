**Author:** {{author}}
{% if url %}**URL:** [{{title}}]({{url}}){% endif %}

{{content | blockquote}}
{%- if note %}

**Note:** {{note}}
{%- endif %}
{%- if chapter %}
**Chapter:** {{chapter}}
{%- endif %}
{%- if page %}
**Page:** {{page}}
{%- endif %}
{%- if tags %}
{% for tag in tags %}#{{tag.name}}{% if not loop.last %}, {% endif %}{% endfor %}
{%- endif %}