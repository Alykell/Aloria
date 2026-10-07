package fr.alykell.aloria.hud.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.module.HudModule;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * aloria-hud.json : { "global": {...}, "visual": {...}, "modules": { "fps": {...}, ... } }.
 * Lancé par Aloria, le fichier est commun à tous les profils (-Daloriahud.config=…/.aloria/shared/aloria-hud.json) ;
 * sinon c'est celui du dossier config du jeu.
 */
public final class HudConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = System.getProperty("aloriahud.config") != null
		? Path.of(System.getProperty("aloriahud.config"))
		: FabricLoader.getInstance().getConfigDir().resolve("aloria-hud.json");
	private static final Type MODULES_TYPE = new TypeToken<Map<String, ModuleSettings>>() {}.getType();

	private GlobalSettings global = new GlobalSettings();
	private VisualSettings visual = new VisualSettings();
	private final Map<String, ModuleSettings> modules = new LinkedHashMap<>();

	/** Fichier lu et enregistré (commun à tous les profils quand le jeu est lancé par Aloria) */
	public static Path file() {
		return FILE;
	}

	public GlobalSettings global() {
		return global;
	}

	public VisualSettings visual() {
		return visual;
	}

	public void resetVisual() {
		visual = new VisualSettings();
	}

	public ModuleSettings get(HudModule module) {
		return modules.computeIfAbsent(module.id(), id -> module.defaults());
	}

	public void reset(HudModule module) {
		modules.put(module.id(), module.defaults());
	}

	public static HudConfig load(List<HudModule> modules) {
		HudConfig config = new HudConfig();
		if (Files.exists(FILE)) {
			try {
				JsonObject json = JsonParser.parseString(Files.readString(FILE, StandardCharsets.UTF_8)).getAsJsonObject();
				if (json.has("modules")) {
					if (json.has("global")) config.global = GSON.fromJson(json.get("global"), GlobalSettings.class);
					if (json.has("visual")) config.visual = GSON.fromJson(json.get("visual"), VisualSettings.class);
					config.modules.putAll(GSON.fromJson(json.get("modules"), MODULES_TYPE));
				} else {
					// Ancien format (versions précédentes) : directement la liste des modules
					config.modules.putAll(GSON.fromJson(json, MODULES_TYPE));
				}
			} catch (Exception e) {
				AloriaHud.LOGGER.warn("Configuration illisible, valeurs par défaut utilisées", e);
			}
		}
		modules.forEach(config::get);
		return config;
	}

	public void save() {
		JsonObject json = new JsonObject();
		json.add("global", GSON.toJsonTree(global));
		json.add("visual", GSON.toJsonTree(visual));
		json.add("modules", GSON.toJsonTree(modules, MODULES_TYPE));
		try {
			Files.createDirectories(FILE.getParent());
			// Écrit à côté puis remplace d'un coup : deux jeux ouverts ne laissent jamais un fichier à moitié écrit
			Path temp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.writeString(temp, GSON.toJson(json), StandardCharsets.UTF_8);
			Files.move(temp, FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			AloriaHud.LOGGER.error("Impossible d'enregistrer la configuration du HUD", e);
		}
	}
}
