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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** config/aloria-hud.json : { "global": {...}, "modules": { "fps": {...}, ... } } */
public final class HudConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("aloria-hud.json");
	private static final Type MODULES_TYPE = new TypeToken<Map<String, ModuleSettings>>() {}.getType();

	private GlobalSettings global = new GlobalSettings();
	private VisualSettings visual = new VisualSettings();
	private final Map<String, ModuleSettings> modules = new LinkedHashMap<>();

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
			Files.writeString(FILE, GSON.toJson(json), StandardCharsets.UTF_8);
		} catch (IOException e) {
			AloriaHud.LOGGER.error("Impossible d'enregistrer la configuration du HUD", e);
		}
	}
}
