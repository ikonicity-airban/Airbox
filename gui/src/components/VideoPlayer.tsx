import React from "react";
import MpvPlayer from "./player/MpvPlayer";
import WebPlayer from "./player/WebPlayer";

export default function VideoPlayer(props: any): React.JSX.Element {
  const isElectron =
    typeof window !== "undefined" &&
    Boolean((window as any).electron && (window as any).sharedStateAPI?.playInMpv);

  if (isElectron) {
    return <MpvPlayer {...props} />;
  }

  return <WebPlayer {...props} />;
}
