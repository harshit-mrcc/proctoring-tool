import cv2


def main() -> None:
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Unable to access webcam")

    print("Press 'q' to quit webcam test.")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        cv2.imshow("Webcam Test", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()