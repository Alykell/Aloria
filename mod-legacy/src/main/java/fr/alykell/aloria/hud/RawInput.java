package fr.alykell.aloria.hud;

import net.java.games.input.Controller;
import net.java.games.input.ControllerEnvironment;
import net.java.games.input.Mouse;

import java.util.ArrayList;
import java.util.List;

/**
 * Entrée brute de la souris en 1.8.9 : la 1.8.9 lit le curseur de Windows (vitesse du pointeur et accélération
 * comprises), alors que les versions récentes lisent la souris directement. On lit donc la souris avec JInput,
 * fourni avec le jeu, dans un fil à part ; MouseInputMixin remplace les déplacements du jeu par les nôtres.
 */
public final class RawInput {
	private static final List<Mouse> MICE = new ArrayList<>();
	private static double dx;
	private static double dy;
	private static boolean started;
	private static boolean available;

	private RawInput() {
	}

	/** Démarre la lecture (une fois) ; faux si aucune souris n'est accessible : le jeu garde sa lecture normale */
	public static synchronized boolean available() {
		if (!started) {
			started = true;
			try {
				for (Controller c : ControllerEnvironment.getDefaultEnvironment().getControllers()) {
					if (c.getType() == Controller.Type.MOUSE && c instanceof Mouse) MICE.add((Mouse) c);
				}
				available = !MICE.isEmpty();
				if (available) {
					Thread thread = new Thread(RawInput::poll, "Aloria HUD - entrée brute");
					thread.setDaemon(true);
					thread.start();
				}
				AloriaHud.LOGGER.info("Entrée brute : {} souris trouvée(s)", MICE.size());
			} catch (Throwable t) {
				AloriaHud.LOGGER.warn("Entrée brute indisponible, lecture normale de la souris", t);
				available = false;
			}
		}
		return available;
	}

	private static void poll() {
		while (true) {
			double x = 0;
			double y = 0;
			for (Mouse mouse : MICE) {
				if (!mouse.poll()) continue;
				x += mouse.getX().getPollData();
				y += mouse.getY().getPollData();
			}
			if (x != 0 || y != 0) {
				synchronized (RawInput.class) {
					dx += x;
					dy += y;
				}
			}
			try {
				Thread.sleep(1);
			} catch (InterruptedException e) {
				return;
			}
		}
	}

	/** Déplacement accumulé depuis le dernier appel, au format de la 1.8.9 (y vers le haut), puis remise à zéro */
	public static synchronized int[] take() {
		int x = (int) Math.round(dx);
		int y = (int) Math.round(dy);
		dx -= x;
		dy -= y;
		return new int[] {x, -y};
	}

	/** Oublie les déplacements faits pendant qu'un menu était ouvert */
	public static synchronized void reset() {
		dx = 0;
		dy = 0;
	}
}
