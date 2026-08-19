from pathlib import Path

css_path = Path("pages-src/final.css")
shell_path = Path("pages-src/shell.html")

css = css_path.read_text(encoding="utf-8")
shell = shell_path.read_text(encoding="utf-8")

marker = "/* RESERVATION MOBILE WIDTH FIX 2026-08-19 */"
if marker not in css:
    css += """

/* RESERVATION MOBILE WIDTH FIX 2026-08-19 */
html{max-width:100%;overflow-x:hidden}
body{max-width:100%;overflow-x:clip}
.reservation-shell,.schedule-controls,.schedule-controls>section,.date-row,.theme-filter,.schedule-heading,.schedule,.schedule-theme,.slot-grid{min-width:0;max-width:100%}
.schedule-controls>section{width:100%}
.date-row{width:100%;overflow-x:auto;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}
.theme-filter{width:100%}
.schedule-theme{width:100%}
@media(max-width:600px){.reservation-shell{overflow-x:clip}.slot-grid{width:100%}.schedule-theme>header{width:100%}}
"""

shell = shell.replace("v=20260819-2", "v=20260819-3")

css_path.write_text(css, encoding="utf-8")
shell_path.write_text(shell, encoding="utf-8")
print("Reservation mobile width fix applied")
