import { useState } from "react";
import { RmaCrasPanel } from "./RmaCrasPanel.jsx";
import { RmaCreasPanel } from "./RmaCreasPanel.jsx";
import { RmaPopPanel } from "./RmaPopPanel.jsx";

export function RmaPanelPage({ usuario }) {
  const [aba, setAba] = useState("cras");

  return (
    <div className="rma-hub">
      <div className="rma-mode-tabs" role="tablist" aria-label="Tipo de RMA">
        <button
          type="button"
          role="tab"
          aria-selected={aba === "cras"}
          className={aba === "cras" ? "rma-tab active" : "rma-tab"}
          onClick={() => setAba("cras")}
        >
          RMA CRAS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "creas"}
          className={aba === "creas" ? "rma-tab active" : "rma-tab"}
          onClick={() => setAba("creas")}
        >
          RMA CREAS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "pop"}
          className={aba === "pop" ? "rma-tab active" : "rma-tab"}
          onClick={() => setAba("pop")}
        >
          RMA Centro POP
        </button>
      </div>
      {aba === "cras" ? (
        <RmaCrasPanel usuario={usuario} />
      ) : aba === "creas" ? (
        <RmaCreasPanel usuario={usuario} />
      ) : (
        <RmaPopPanel usuario={usuario} />
      )}
    </div>
  );
}
