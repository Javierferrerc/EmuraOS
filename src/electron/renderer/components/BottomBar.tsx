import xIcon from "../assets/icons/controls/x.svg";
import triangleIcon from "../assets/icons/controls/triangle.svg";
import squareIcon from "../assets/icons/controls/square.svg";
import navigateIcon from "../assets/icons/controls/navigate.svg";

export function BottomBar() {
  return (
    <footer className="flex items-center justify-end gap-6 px-4 pt-2 pb-4 text-[16px] font-medium text-muted">
      <span className="flex items-center gap-1.5">
        <img src={xIcon} alt="" className="h-5 w-5" />
        Select Game
      </span>
      <span className="flex items-center gap-1.5">
        <img src={triangleIcon} alt="" className="h-5 w-5" />
        Toggle Favorite
      </span>
      <span className="flex items-center gap-1.5">
        <img src={squareIcon} alt="" className="h-5 w-5" />
        Game Options
      </span>
      <span className="flex items-center gap-1.5">
        <img src={navigateIcon} alt="" className="h-5 w-5" />
        Navigate
      </span>
    </footer>
  );
}
