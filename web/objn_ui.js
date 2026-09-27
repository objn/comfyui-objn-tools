const STYLE = `
:root{
  --objn-bg:var(--comfy-menu-bg,#1f1f24);
  --objn-surface:var(--comfy-input-bg,#141418);
  --objn-border:var(--border-color,#3a3a44);
  --objn-text:var(--input-text,#e6e6e6);
  --objn-muted:var(--descrip-text,#9a9aa4);
  --objn-accent:#4caf50;
  --objn-danger:#ff6b6b;
  --objn-radius:8px;
}
.objn-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center}
.objn-panel{width:min(640px,92vw);max-height:88vh;background:var(--objn-bg);color:var(--objn-text);border:1px solid var(--objn-border);border-radius:12px;display:flex;flex-direction:column;font:14px system-ui,sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.5);overflow:hidden}
.objn-panel.large{width:min(1100px,92vw);height:min(720px,88vh);min-height:0}
.objn-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--objn-border)}
.objn-title{flex:1;font-weight:600;font-size:15px}
.objn-btn{padding:6px 14px;border:1px solid var(--objn-border);border-radius:var(--objn-radius);background:var(--objn-surface);color:var(--objn-text);font:inherit;font-size:13px;cursor:pointer}
.objn-btn:hover{border-color:var(--objn-muted)}
.objn-btn.primary{background:var(--objn-accent);border-color:var(--objn-accent);color:#fff}
.objn-btn.ghost{background:none;border-style:dashed;color:var(--objn-muted)}
.objn-btn.ghost:hover{color:var(--objn-text)}
.objn-x{border:0;background:none;color:inherit;opacity:.5;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}
.objn-x:hover{opacity:1}
.objn-input,.objn-select{padding:6px 10px;border:1px solid var(--objn-border);border-radius:var(--objn-radius);background:var(--objn-surface);color:var(--objn-text);font:inherit}
.objn-input:focus,.objn-select:focus{outline:none;border-color:var(--objn-accent)}
.objn-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--objn-muted)}
.objn-hint,.objn-placeholder{font-size:12px;color:var(--objn-muted);line-height:1.5}
.objn-foot{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--objn-border)}
.objn-foot[hidden]{display:none}
.objn-foot .objn-input{flex:1;font-family:ui-monospace,monospace;font-size:15px}
.objn-foot.error .objn-input{border-color:var(--objn-danger)}
.objn-msg{color:var(--objn-danger);font-size:13px}

.objn-body{flex:1;display:flex;min-height:0;overflow:hidden}
.objn-router-body{flex:1;min-height:0}
.objn-router-sidebar{box-sizing:border-box;width:220px;flex:none;min-height:0;overflow:auto;padding:12px;border-right:1px solid var(--objn-border)}
.objn-router-sidebar>.objn-palette{width:auto;border:0;padding:0;min-width:0}
.objn-router-sidebar>.objn-output-config{border:0;padding:0}
.objn-router-main{flex:1;min-width:0;min-height:0;overflow:auto;padding:16px 20px}
.objn-tab-empty{color:var(--objn-muted);font-size:13px}
.objn-palette{box-sizing:border-box;width:220px;flex:none;min-height:0;overflow:auto;padding:12px;border-right:1px solid var(--objn-border);display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px}
.objn-palette .objn-label{flex-basis:100%;margin:10px 0 2px}
.objn-palette .objn-hint{flex-basis:100%;margin-top:auto;padding-top:12px}
.objn-section-tabs{display:flex;flex:none;gap:4px;padding:0 20px;border-bottom:1px solid var(--objn-border)}
.objn-section-tab{flex:1;padding:8px 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--objn-muted);font:inherit;cursor:pointer}
.objn-section-tab:hover{color:var(--objn-text)}
.objn-section-tab.active{border-bottom-color:var(--objn-accent);color:var(--objn-text)}
.objn-tab-panel[hidden]{display:none!important}
.objn-rules-panel{display:flex;flex-direction:column;gap:10px}
.objn-work{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:16px 20px;gap:10px}
.objn-rules{flex:none;min-height:auto;display:flex;flex-direction:column;gap:10px;overflow:visible}
.objn-rule{display:flex;align-items:center;gap:10px}
.objn-rules.single .objn-rule{flex:1;align-items:stretch}
.objn-tag{min-width:40px;font-size:12px;font-weight:700;color:var(--objn-muted)}
.objn-line{flex:1;min-height:52px;padding:10px 12px;border:1px dashed var(--objn-border);border-radius:10px;background:var(--objn-surface);display:flex;flex-wrap:wrap;align-content:flex-start;align-items:center;gap:8px;font-size:18px;overflow:auto;cursor:text}
.objn-line.active{border:1px solid var(--objn-accent)}
.objn-line.over{border-color:#ffd54f}
.objn-line.end{box-shadow:inset -4px 0 0 #ffd54f}
.objn-block{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--objn-radius);color:#fff;cursor:grab;user-select:none;box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)}
.objn-block.before{box-shadow:-4px 0 0 #ffd54f,inset 0 -2px 0 rgba(0,0,0,.2)}
.objn-block[data-kind=val]{background:#5c6bc0}
.objn-block[data-kind=var]{background:#ef7d1a}
.objn-block[data-kind=arith]{background:#3f9a45}
.objn-block[data-kind=compare]{background:#1f7fd1}
.objn-block[data-kind=logic]{background:#8e3fb0}
.objn-block[data-kind=paren]{background:#5f7482}
.objn-block input{width:80px;border:0;border-radius:6px;padding:2px 6px;font:inherit;background:rgba(255,255,255,.92);color:#111}
.objn-chip{font-size:14px;padding:4px 11px;cursor:pointer}
.objn-work .objn-select{min-width:170px}

.objn-output-config{padding:12px 16px 0;border-bottom:1px solid var(--objn-border)}
.objn-output-config-title{margin-bottom:8px}
.objn-output-config-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.objn-input-name-row{grid-template-columns:1fr}
.objn-output-config-head{margin-bottom:4px}
.objn-router-main>.objn-output-config,.objn-router-main>.objn-import-panel{box-sizing:border-box;width:min(760px,100%);margin:0 auto;border:0;padding:12px 16px}
.objn-input-config-row{display:grid;grid-template-columns:minmax(0,1fr) 84px;align-items:center;gap:12px;margin:8px auto;max-width:620px}
.objn-input-config-custom{grid-template-columns:minmax(0,1fr) 84px 24px}
.objn-input-add{display:block;width:min(620px,100%);margin:10px auto 0}
.objn-io-controls{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 0 14px;border-bottom:1px solid var(--objn-border)}
.objn-io-section{min-width:0;display:flex;flex-direction:column;gap:6px}
.objn-io-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 22px;align-items:center;gap:8px;min-width:0}
.objn-io-input-row{grid-template-columns:minmax(0,1fr) 22px}
.objn-io-row>.objn-input,.objn-io-row>.objn-select{box-sizing:border-box;width:100%;min-width:0;max-width:100%}
.objn-io-row>.objn-select{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.objn-method-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.objn-method-tab{padding:6px 10px;border:1px solid var(--objn-border);border-radius:6px;background:var(--objn-surface);color:var(--objn-muted);font:inherit;cursor:pointer}
.objn-method-tab.active{border-color:var(--objn-accent);color:var(--objn-text)}
.objn-type-badge{box-sizing:border-box;width:100%;padding:4px 6px;border-radius:6px;background:var(--objn-surface);color:var(--objn-muted);font:12px ui-monospace,monospace;text-align:center}
.objn-import-panel{display:flex;flex-direction:column;gap:10px}
.objn-import-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
.objn-import-row{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border:1px solid var(--objn-border);border-radius:6px;background:var(--objn-surface);cursor:pointer}
.objn-import-row input{flex:none}
.objn-import-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.objn-rows{overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.objn-row{display:flex;gap:8px;align-items:center}
.objn-row .objn-input{flex:1;min-width:0}
.objn-cols{display:flex;gap:8px;padding:12px 16px 0;margin-right:26px}
.objn-cols span{flex:1}

.objn-choices{box-sizing:border-box;width:100%;display:flex;flex-direction:column;gap:4px;font:13px system-ui,sans-serif;color:var(--objn-text);padding-bottom:2px;min-width:0;max-width:100%;contain:inline-size;overflow-x:clip}
.objn-choice{box-sizing:border-box;display:flex;align-items:center;gap:8px;min-width:0;padding:5px 10px;border:1px solid transparent;border-radius:var(--objn-radius);background:var(--objn-surface);cursor:pointer}
.objn-choice:hover{border-color:var(--objn-border)}
.objn-choice.checked{border-color:var(--objn-accent);background:color-mix(in srgb,var(--objn-accent) 14%,var(--objn-surface))}
.objn-choice input{appearance:none;flex:none;width:14px;height:14px;margin:0;border:2px solid var(--objn-muted);border-radius:4px;cursor:pointer}
.objn-choice input[type=radio]{border-radius:50%}
.objn-choice input:checked{border-color:var(--objn-accent);background:var(--objn-accent)}
.objn-choice input[type=radio]:checked{box-shadow:inset 0 0 0 2px var(--objn-surface)}
.objn-choice input[type=checkbox]:checked{background:var(--objn-accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8.5l3 3 7-7' stroke='white' stroke-width='2.5' fill='none'/%3E%3C/svg%3E") center/10px no-repeat}
.objn-choice-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.objn-choice-value{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 6px;border-radius:4px;background:rgba(127,127,127,.15);color:var(--objn-muted);font:11px ui-monospace,monospace}

.objn-display{box-sizing:border-box;width:100%;height:100%;container-type:size;display:flex;align-items:center;justify-content:center;border-radius:var(--objn-radius);background:var(--objn-surface);color:var(--objn-text);font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap}
.objn-display-value{font:700 min(62cqh,22cqw) system-ui,sans-serif;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.objn-display.empty{color:var(--objn-muted)}
.objn-display.empty .objn-display-value{font:400 13px system-ui,sans-serif}
`;

export function h(tag, className, ...children) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.append(...children);
    return el;
}

export function ensureStyle() {
    if (document.getElementById("objn-style")) return;
    const style = h("style");
    style.id = "objn-style";
    style.textContent = STYLE;
    document.head.append(style);
}

export function hideWidget(widget) {
    widget.hidden = true;
    widget.options.hidden = true;
}

// onApply returns false to keep the panel open.
export function openPanel({ title, content, large = false, applyLabel = "Apply", onApply }) {
    ensureStyle();
    const apply = h("button", "objn-btn primary", applyLabel);
    const cancel = h("button", "objn-btn", "Cancel");
    const overlay = h("div", "objn-overlay", h("div", large ? "objn-panel large" : "objn-panel",
        h("div", "objn-head", h("span", "objn-title", title), cancel, apply),
        ...content,
    ));
    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    cancel.onclick = close;
    apply.onclick = () => onApply() !== false && close();
    document.body.append(overlay);
}
