import { useEffect, useState } from "react";
import { useViewerState } from "../context/ViewerStateContext";

export function PersonLabelEditor(props: {
  clusterId: string;
  backendLabel: string | null;
}) {
  const { clusterId, backendLabel } = props;
  const { state, setPersonOverride } = useViewerState();
  const override = state?.person_overrides[clusterId] ?? "";
  const [value, setValue] = useState(override || backendLabel || "");

  useEffect(() => {
    setValue(override || backendLabel || "");
  }, [override, backendLabel]);

  return (
    <input
      className="person-label-input"
      value={value}
      maxLength={60}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void setPersonOverride(clusterId, value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          void setPersonOverride(clusterId, value);
          event.currentTarget.blur();
        }
      }}
      aria-label="Rename person"
    />
  );
}
